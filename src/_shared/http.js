'use strict';

var { normalizeHttpUrl, safeParseUrl } = require('./bytes');

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function getSetting(key, fallback) {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.SCRAPER_SETTINGS && globalThis.SCRAPER_SETTINGS[key] != null) {
      var val = globalThis.SCRAPER_SETTINGS[key];
      if (val !== '') return val;
    }
  } catch (_) {}
  return fallback;
}

function createBudget(totalMs) {
  var start = Date.now();
  var limit = totalMs || 45000;
  return {
    start: start,
    totalMs: limit,
    elapsed: function () {
      return Date.now() - start;
    },
    remaining: function () {
      return Math.max(0, limit - (Date.now() - start));
    },
    expired: function (reserveMs) {
      return (Date.now() - start) >= (limit - (reserveMs || 0));
    }
  };
}

function getHeader(headers, name) {
  if (!headers) return '';
  var target = String(name || '').toLowerCase();
  if (typeof headers.get === 'function') {
    return headers.get(target) || headers.get(name) || '';
  }
  for (var k in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, k) && k.toLowerCase() === target) {
      return headers[k] || '';
    }
  }
  return '';
}

async function safeFetch(url, options, timeoutMs) {
  var opts = options || {};
  var normalized = normalizeHttpUrl(url);
  if (!normalized || !/^https?:\/\//i.test(normalized)) {
    throw new Error('Invalid fetch URL: ' + url);
  }

  var headers = {};
  if (opts.headers) {
    for (var k in opts.headers) {
      if (Object.prototype.hasOwnProperty.call(opts.headers, k)) {
        var lk = k.toLowerCase();
        // Do not spoof proxy IP headers when executing directly on user's device
        if (lk === 'x-forwarded-for' || lk === 'x-real-ip' || lk === 'client-ip') continue;
        headers[k] = opts.headers[k];
      }
    }
  }
  if (!headers['User-Agent'] && !headers['user-agent']) {
    headers['User-Agent'] = UA;
  }

  var fetchOpts = {
    method: opts.method || 'GET',
    headers: headers
  };

  if (opts.body != null) {
    fetchOpts.body = typeof opts.body === 'string' ? opts.body : String(opts.body);
  }
  if (opts.redirect) {
    fetchOpts.redirect = opts.redirect;
  }

  var controller = null;
  var timerId = null;
  if (opts.signal) {
    fetchOpts.signal = opts.signal;
  } else if (typeof AbortController === 'function' && typeof setTimeout === 'function') {
    controller = new AbortController();
    fetchOpts.signal = controller.signal;
    timerId = setTimeout(function () {
      try { controller.abort(); } catch (_) {}
    }, timeoutMs || 8000);
  }

  try {
    return await fetch(normalized, fetchOpts);
  } finally {
    if (timerId !== null && typeof clearTimeout === 'function') {
      clearTimeout(timerId);
    }
  }
}

async function fetchText(url, options, timeoutMs) {
  try {
    var res = await safeFetch(url, options, timeoutMs);
    var text = await res.text();
    return {
      ok: Boolean(res.ok),
      status: res.status || 0,
      url: res.url || normalizeHttpUrl(url),
      headers: res.headers,
      text: text || ''
    };
  } catch (_) {
    return null;
  }
}

async function fetchJson(url, options, timeoutMs) {
  var res = await fetchText(url, options, timeoutMs);
  if (!res || !res.ok || !res.text) return null;
  try {
    return JSON.parse(res.text);
  } catch (_) {
    return null;
  }
}

/**
 * Resolves HTTP redirects cleanly across both Android OkHttp (supports redirect: 'manual' + Location)
 * and iOS Ktor Darwin (ignores redirect: 'manual' and returns final response.url).
 */
async function resolveRedirectUrl(targetUrl, options, timeoutMs) {
  var startUrl = normalizeHttpUrl(targetUrl);
  if (!startUrl) return '';
  try {
    var reqOpts = {};
    if (options) {
      for (var k in options) {
        if (Object.prototype.hasOwnProperty.call(options, k)) reqOpts[k] = options[k];
      }
    }
    reqOpts.redirect = 'manual';

    var res = await safeFetch(startUrl, reqOpts, timeoutMs || 6000);
    var loc = getHeader(res.headers, 'location');
    if (loc) {
      return normalizeHttpUrl(loc, startUrl);
    }

    if (res.url && res.url !== startUrl) {
      return normalizeHttpUrl(res.url, startUrl);
    }

    // Fallback: inspect light HTML meta-refresh or window.location redirect
    if (res.text) {
      var body = await res.text();
      if (body && body.length < 40000) {
        var m = body.match(/(?:window\.location(?:\.href)?\s*=\s*|http-equiv=["']refresh["'][^>]*content=["'][^"']*url=)['"]?([^"'\s>]+)/i);
        if (m && m[1]) {
          return normalizeHttpUrl(m[1], startUrl);
        }
      }
    }
  } catch (_) {}
  return '';
}

function getOrigin(url) {
  var u = safeParseUrl(url);
  return u ? u.origin : '';
}

module.exports = {
  UA,
  getSetting,
  createBudget,
  getHeader,
  safeFetch,
  fetchText,
  fetchJson,
  resolveRedirectUrl,
  getOrigin
};
