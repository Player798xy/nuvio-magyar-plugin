"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/_shared/bytes.js
var require_bytes = __commonJS({
  "src/_shared/bytes.js"(exports2, module2) {
    "use strict";
    var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var B64_LOOKUP = function() {
      var table = new Int16Array(256);
      for (var i = 0; i < 256; i++) table[i] = -1;
      for (var j = 0; j < B64_CHARS.length; j++) {
        table[B64_CHARS.charCodeAt(j)] = j;
      }
      return table;
    }();
    function base64ToBytes(str) {
      var clean = String(str || "").replace(/[\r\n\s]/g, "").replace(/-/g, "+").replace(/_/g, "/");
      if (!clean) return new Uint8Array(0);
      while (clean.length % 4 !== 0) clean += "=";
      var len = clean.length;
      var pad = 0;
      if (clean.charAt(len - 1) === "=") pad++;
      if (clean.charAt(len - 2) === "=") pad++;
      var outLen = len / 4 * 3 - pad;
      var out = new Uint8Array(outLen);
      var p = 0;
      for (var i = 0; i < len; i += 4) {
        var a = B64_LOOKUP[clean.charCodeAt(i) & 255];
        var b = B64_LOOKUP[clean.charCodeAt(i + 1) & 255];
        var c = clean.charAt(i + 2) === "=" ? 0 : B64_LOOKUP[clean.charCodeAt(i + 2) & 255];
        var d = clean.charAt(i + 3) === "=" ? 0 : B64_LOOKUP[clean.charCodeAt(i + 3) & 255];
        if (a < 0 || b < 0 || c < 0 || d < 0) {
          throw new Error("Invalid base64 character");
        }
        var n = a << 18 | b << 12 | c << 6 | d;
        if (p < outLen) out[p++] = n >>> 16 & 255;
        if (p < outLen) out[p++] = n >>> 8 & 255;
        if (p < outLen) out[p++] = n & 255;
      }
      return out;
    }
    function bytesToBase64(bytes) {
      if (!bytes || !bytes.length) return "";
      var out = "";
      var len = bytes.length;
      for (var i = 0; i < len; i += 3) {
        var b0 = bytes[i];
        var b1 = i + 1 < len ? bytes[i + 1] : 0;
        var b2 = i + 2 < len ? bytes[i + 2] : 0;
        var n = b0 << 16 | b1 << 8 | b2;
        out += B64_CHARS.charAt(n >>> 18 & 63);
        out += B64_CHARS.charAt(n >>> 12 & 63);
        out += i + 1 < len ? B64_CHARS.charAt(n >>> 6 & 63) : "=";
        out += i + 2 < len ? B64_CHARS.charAt(n & 63) : "=";
      }
      return out;
    }
    function stringToBase64(str) {
      return bytesToBase64(utf8ToBytes(str));
    }
    function hexToBytes(hex) {
      var clean = String(hex || "").replace(/[^0-9a-fA-F]/g, "");
      var len = clean.length >> 1;
      var out = new Uint8Array(len);
      for (var i = 0; i < len; i++) {
        out[i] = parseInt(clean.substr(i * 2, 2), 16) & 255;
      }
      return out;
    }
    function bytesToHex(bytes) {
      var out = "";
      for (var i = 0; i < bytes.length; i++) {
        var h = (bytes[i] & 255).toString(16);
        out += h.length === 1 ? "0" + h : h;
      }
      return out;
    }
    function utf8ToBytes(str) {
      var s = String(str || "");
      var bytes = [];
      for (var i = 0; i < s.length; i++) {
        var code = s.charCodeAt(i);
        if (code >= 55296 && code <= 56319 && i + 1 < s.length) {
          var low = s.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            code = 65536 + (code - 55296 << 10) + (low - 56320);
            i++;
          }
        }
        if (code < 128) {
          bytes.push(code);
        } else if (code < 2048) {
          bytes.push(192 | code >>> 6, 128 | code & 63);
        } else if (code < 65536) {
          bytes.push(224 | code >>> 12, 128 | code >>> 6 & 63, 128 | code & 63);
        } else {
          bytes.push(
            240 | code >>> 18,
            128 | code >>> 12 & 63,
            128 | code >>> 6 & 63,
            128 | code & 63
          );
        }
      }
      return new Uint8Array(bytes);
    }
    function bytesToUtf8(bytes) {
      if (!bytes || !bytes.length) return "";
      var out = "";
      var i = 0;
      var len = bytes.length;
      while (i < len) {
        var b0 = bytes[i++];
        if (b0 < 128) {
          out += String.fromCharCode(b0);
        } else if ((b0 & 224) === 192 && i < len) {
          var b1 = bytes[i++] & 63;
          out += String.fromCharCode((b0 & 31) << 6 | b1);
        } else if ((b0 & 240) === 224 && i + 1 < len) {
          var b1e = bytes[i++] & 63;
          var b2e = bytes[i++] & 63;
          out += String.fromCharCode((b0 & 15) << 12 | b1e << 6 | b2e);
        } else if ((b0 & 248) === 240 && i + 2 < len) {
          var b1f = bytes[i++] & 63;
          var b2f = bytes[i++] & 63;
          var b3f = bytes[i++] & 63;
          var cp = (b0 & 7) << 18 | b1f << 12 | b2f << 6 | b3f;
          if (cp <= 65535) {
            out += String.fromCharCode(cp);
          } else {
            cp -= 65536;
            out += String.fromCharCode(55296 + (cp >>> 10), 56320 + (cp & 1023));
          }
        } else {
          out += "\uFFFD";
        }
      }
      return out;
    }
    function rc4DecryptBytesToUtf8(cipherBytes, keyStr) {
      var keyBytes = utf8ToBytes(keyStr);
      var s = [];
      var j = 0;
      for (var i = 0; i < 256; i++) s[i] = i;
      for (var k = 0; k < 256; k++) {
        j = (j + s[k] + keyBytes[k % keyBytes.length]) % 256;
        var tmp = s[k];
        s[k] = s[j];
        s[j] = tmp;
      }
      var a = 0;
      var b = 0;
      var out = new Uint8Array(cipherBytes.length);
      for (var y = 0; y < cipherBytes.length; y++) {
        a = (a + 1) % 256;
        b = (b + s[a]) % 256;
        var t = s[a];
        s[a] = s[b];
        s[b] = t;
        out[y] = cipherBytes[y] ^ s[(s[a] + s[b]) % 256];
      }
      return bytesToUtf8(out);
    }
    function decodeHtmlEntities2(str) {
      if (!str || typeof str !== "string") return "";
      return str.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&nbsp;/gi, " ").replace(/&#x([0-9a-fA-F]+);/g, function(_, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      }).replace(/&#(\d+);/g, function(_, dec) {
        return String.fromCharCode(parseInt(dec, 10));
      });
    }
    function normalizeHttpUrl2(rawUrl, baseUrl) {
      if (!rawUrl || typeof rawUrl !== "string") return "";
      var s = decodeHtmlEntities2(rawUrl).trim();
      if (!s) return "";
      if (s.indexOf("//") === 0) return "https:" + s;
      if (/^https?:\/\//i.test(s)) return s;
      if (baseUrl) {
        if (typeof URL === "function") {
          try {
            return new URL(s, baseUrl).href;
          } catch (_) {
          }
        }
        var m = String(baseUrl).match(/^(https?:\/\/[^/?#]+)(\/[^?#]*)?/i);
        if (m) {
          if (s.charAt(0) === "/") return m[1] + s;
          if (s.charAt(0) === "?" || s.charAt(0) === "#") return m[1] + (m[2] || "/") + s;
          var baseDir = (m[2] || "/").replace(/\/[^/]*$/, "/");
          return m[1] + baseDir + s;
        }
      }
      return s;
    }
    function safeParseUrl(rawUrl, baseUrl) {
      var normalized = normalizeHttpUrl2(rawUrl, baseUrl);
      if (!normalized) return null;
      if (typeof URL === "function") {
        try {
          return new URL(normalized);
        } catch (_) {
          return null;
        }
      }
      var m = normalized.match(/^(https?:)\/\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i);
      if (!m) return null;
      var protocol = m[1].toLowerCase();
      var host = m[2];
      var colonIdx = host.indexOf(":");
      var hostname = colonIdx !== -1 ? host.slice(0, colonIdx) : host;
      return {
        href: normalized,
        protocol,
        host,
        hostname,
        origin: protocol + "//" + host,
        pathname: m[3] || "/",
        search: m[4] || "",
        hash: m[5] || ""
      };
    }
    module2.exports = {
      base64ToBytes,
      bytesToBase64,
      stringToBase64,
      hexToBytes,
      bytesToHex,
      utf8ToBytes,
      bytesToUtf8,
      rc4DecryptBytesToUtf8,
      decodeHtmlEntities: decodeHtmlEntities2,
      normalizeHttpUrl: normalizeHttpUrl2,
      safeParseUrl
    };
  }
});

// src/_shared/http.js
var require_http = __commonJS({
  "src/_shared/http.js"(exports2, module2) {
    "use strict";
    var { normalizeHttpUrl: normalizeHttpUrl2, safeParseUrl } = require_bytes();
    var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
    function getSetting(key, fallback) {
      try {
        if (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS && globalThis.SCRAPER_SETTINGS[key] != null) {
          var val = globalThis.SCRAPER_SETTINGS[key];
          if (val !== "") return val;
        }
      } catch (_) {
      }
      return fallback;
    }
    function createBudget2(totalMs) {
      var start = Date.now();
      var limit = totalMs || 45e3;
      return {
        start,
        totalMs: limit,
        elapsed: function() {
          return Date.now() - start;
        },
        remaining: function() {
          return Math.max(0, limit - (Date.now() - start));
        },
        expired: function(reserveMs) {
          return Date.now() - start >= limit - (reserveMs || 0);
        }
      };
    }
    function getHeader(headers, name) {
      if (!headers) return "";
      var target = String(name || "").toLowerCase();
      if (typeof headers.get === "function") {
        return headers.get(target) || headers.get(name) || "";
      }
      for (var k in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, k) && k.toLowerCase() === target) {
          return headers[k] || "";
        }
      }
      return "";
    }
    function safeFetch(url, options, timeoutMs) {
      return __async(this, null, function* () {
        var opts = options || {};
        var normalized = normalizeHttpUrl2(url);
        if (!normalized || !/^https?:\/\//i.test(normalized)) {
          throw new Error("Invalid fetch URL: " + url);
        }
        var headers = {};
        if (opts.headers) {
          for (var k in opts.headers) {
            if (Object.prototype.hasOwnProperty.call(opts.headers, k)) {
              var lk = k.toLowerCase();
              if (lk === "x-forwarded-for" || lk === "x-real-ip" || lk === "client-ip") continue;
              headers[k] = opts.headers[k];
            }
          }
        }
        if (!headers["User-Agent"] && !headers["user-agent"]) {
          headers["User-Agent"] = UA;
        }
        var fetchOpts = {
          method: opts.method || "GET",
          headers
        };
        if (opts.body != null) {
          fetchOpts.body = typeof opts.body === "string" ? opts.body : String(opts.body);
        }
        if (opts.redirect) {
          fetchOpts.redirect = opts.redirect;
        }
        var controller = null;
        var timerId = null;
        if (opts.signal) {
          fetchOpts.signal = opts.signal;
        } else if (typeof AbortController === "function" && typeof setTimeout === "function") {
          controller = new AbortController();
          fetchOpts.signal = controller.signal;
          timerId = setTimeout(function() {
            try {
              controller.abort();
            } catch (_) {
            }
          }, timeoutMs || 8e3);
        }
        try {
          return yield fetch(normalized, fetchOpts);
        } finally {
          if (timerId !== null && typeof clearTimeout === "function") {
            clearTimeout(timerId);
          }
        }
      });
    }
    function fetchText2(url, options, timeoutMs) {
      return __async(this, null, function* () {
        try {
          var res = yield safeFetch(url, options, timeoutMs);
          var text = yield res.text();
          return {
            ok: Boolean(res.ok),
            status: res.status || 0,
            url: res.url || normalizeHttpUrl2(url),
            headers: res.headers,
            text: text || ""
          };
        } catch (_) {
          return null;
        }
      });
    }
    function fetchJson(url, options, timeoutMs) {
      return __async(this, null, function* () {
        var res = yield fetchText2(url, options, timeoutMs);
        if (!res || !res.ok || !res.text) return null;
        try {
          return JSON.parse(res.text);
        } catch (_) {
          return null;
        }
      });
    }
    function resolveRedirectUrl2(targetUrl, options, timeoutMs) {
      return __async(this, null, function* () {
        var startUrl = normalizeHttpUrl2(targetUrl);
        if (!startUrl) return "";
        try {
          var reqOpts = {};
          if (options) {
            for (var k in options) {
              if (Object.prototype.hasOwnProperty.call(options, k)) reqOpts[k] = options[k];
            }
          }
          reqOpts.redirect = "manual";
          var res = yield safeFetch(startUrl, reqOpts, timeoutMs || 6e3);
          var loc = getHeader(res.headers, "location");
          if (loc) {
            return normalizeHttpUrl2(loc, startUrl);
          }
          if (res.url && res.url !== startUrl) {
            return normalizeHttpUrl2(res.url, startUrl);
          }
          if (res.text) {
            var body = yield res.text();
            if (body && body.length < 4e4) {
              var m = body.match(/(?:window\.location(?:\.href)?\s*=\s*|http-equiv=["']refresh["'][^>]*content=["'][^"']*url=)['"]?([^"'\s>]+)/i);
              if (m && m[1]) {
                return normalizeHttpUrl2(m[1], startUrl);
              }
            }
          }
        } catch (_) {
        }
        return "";
      });
    }
    function getOrigin(url) {
      var u = safeParseUrl(url);
      return u ? u.origin : "";
    }
    module2.exports = {
      UA,
      getSetting,
      createBudget: createBudget2,
      getHeader,
      safeFetch,
      fetchText: fetchText2,
      fetchJson,
      resolveRedirectUrl: resolveRedirectUrl2,
      getOrigin
    };
  }
});

// src/_shared/crypto_decoders.js
var require_crypto_decoders = __commonJS({
  "src/_shared/crypto_decoders.js"(exports2, module2) {
    "use strict";
    var CryptoJS = require("crypto-js");
    var {
      base64ToBytes,
      bytesToUtf8,
      hexToBytes,
      utf8ToBytes
    } = require_bytes();
    function _seed(value) {
      var state = 2166136261 >>> 0;
      for (var i = 0; i < value.length; i++) {
        state ^= value.charCodeAt(i);
        state = state + (state << 1) + (state << 4) + (state << 7) + (state << 8) + (state << 24) >>> 0;
      }
      return state >>> 0;
    }
    function _generator(state) {
      var s = state >>> 0;
      return function nxt() {
        s ^= s << 13 >>> 0;
        s ^= s >>> 17;
        s ^= s << 5 >>> 0;
        return s >>> 0;
      };
    }
    function unpackNetMoziPayload(value, token) {
      if (!value || typeof token !== "string" || !token) return [];
      if (value.v === 2) {
        try {
          if (!value.s || !Array.isArray(value.d) || typeof value.m !== "string") return [];
          var manifest = base64ToBytes(value.m);
          if (!manifest.length || manifest.length % 4) return [];
          var order = _generator(_seed(token + "|" + value.s + "|v2/positions") || 1);
          var encoded = "";
          for (var i = 0; i < manifest.length; i += 4) {
            var entry = (manifest[i] << 24 | manifest[i + 1] << 16 | manifest[i + 2] << 8 | manifest[i + 3]) >>> 0;
            var position = (entry ^ order()) >>> 0;
            var bin = position % 4;
            var index = Math.floor(position / 4);
            if (!Array.isArray(value.d[bin]) || typeof value.d[bin][index] !== "string") return [];
            encoded += value.d[bin][index];
          }
          var state = _seed("v2|" + value.s + "|" + token) || 1;
          var previous = state & 255;
          var bytes = base64ToBytes(encoded);
          var next = _generator(state);
          var plain = new Uint8Array(bytes.length);
          for (var j = 0; j < bytes.length; j++) {
            var cipher = bytes[j];
            plain[j] = (cipher ^ next() & 255) - previous - j % 251 & 255;
            previous = cipher;
          }
          var routes = JSON.parse(bytesToUtf8(plain));
          return Array.isArray(routes) ? routes : [routes];
        } catch (_) {
          return [];
        }
      }
      if (value.r && value.p) {
        try {
          var orderV1 = _generator(_seed(token + "|" + value.n + "|order") || 1);
          var encodedV1 = "";
          for (var k = 0; k < value.r.length; k++) {
            var pos = (Number(value.r[k]) ^ orderV1()) >>> 0;
            if (!Array.isArray(value.p[pos % 3]) || typeof value.p[pos % 3][Math.floor(pos / 3)] !== "string") return [];
            encodedV1 += value.p[pos % 3][Math.floor(pos / 3)];
          }
          var raw = base64ToBytes(encodedV1);
          var nxt = _generator(_seed(token + "|" + value.n) || 1);
          var out = new Uint8Array(raw.length);
          for (var m = 0; m < raw.length; m++) {
            out[m] = raw[m] ^ nxt() & 255;
          }
          var parsed = JSON.parse(bytesToUtf8(out));
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch (_) {
          return [];
        }
      }
      return [];
    }
    function escapeRegExp2(s) {
      return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    function resolveNetMoziContent(html) {
      if (!html || typeof html !== "string") return "";
      for (var iter = 0; iter < 3; iter++) {
        if (html.indexOf("data-content-payload") === -1) break;
        var regex = /<script[^>]*data-content-payload[^>]*data-content-context="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g;
        var match;
        var replacedAny = false;
        while ((match = regex.exec(html)) !== null) {
          try {
            var context = match[1];
            var payload = JSON.parse(match[2]);
            var decodedArr = unpackNetMoziPayload(payload.value, context);
            var decoded = Array.isArray(decodedArr) ? decodedArr.join("") : String(decodedArr);
            if (payload.scope) {
              var scopeRegex = new RegExp('<div[^>]*data-content-scope="' + escapeRegExp2(payload.scope) + '"[^>]*>[\\s\\S]*?<\\/div>');
              html = html.replace(scopeRegex, decoded);
            }
            html = html.replace(match[0], "");
            replacedAny = true;
          } catch (_) {
          }
        }
        if (!replacedAny) break;
      }
      return html;
    }
    function decodePackedArgs(p, a, c, k) {
      if (!p || !a || !c || c <= 0 || !Array.isArray(k)) return null;
      var encodeBase = function(num) {
        var first = num < a ? "" : encodeBase(Math.floor(num / a));
        var rem = num % a;
        var ch = rem > 35 ? String.fromCharCode(rem + 29) : rem.toString(36);
        return first + ch;
      };
      var out = p;
      while (c--) {
        if (k[c]) {
          (function(val) {
            out = out.replace(new RegExp("\\b" + encodeBase(c) + "\\b", "g"), function() {
              return val;
            });
          })(k[c]);
        }
      }
      return out;
    }
    function unpackPacker(str) {
      var m = String(str || "").match(/}\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\((['"])\|\7\)/);
      if (!m) return null;
      return decodePackedArgs(m[2], parseInt(m[3], 10), parseInt(m[4], 10), m[6].split("|"));
    }
    function generalUnpack(html) {
      var results = [];
      if (!html || typeof html !== "string") return results;
      var re = /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\((['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\((['"])\|\7\)/g;
      var m;
      while ((m = re.exec(html)) !== null) {
        var unpacked = decodePackedArgs(m[2], parseInt(m[3], 10), parseInt(m[4], 10), m[6].split("|"));
        if (unpacked) results.push(unpacked);
      }
      return results;
    }
    function decodeHunter2(h, u, n, t, e) {
      try {
        var sep = n.charAt(e);
        var parts = String(h || "").split(sep);
        var out = [];
        for (var i = 0; i < parts.length; i++) {
          var part = parts[i];
          if (!part) continue;
          var val = 0;
          for (var j = 0; j < part.length; j++) {
            var idx = n.indexOf(part.charAt(j));
            if (idx !== -1) val = val * e + idx;
          }
          out.push(val - t & 255);
        }
        return bytesToUtf8(new Uint8Array(out));
      } catch (_) {
        return "";
      }
    }
    function decodeVoePayload(encoded) {
      try {
        var rot13 = String(encoded || "").replace(/[a-zA-Z]/g, function(c) {
          var base = c <= "Z" ? 65 : 97;
          return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
        });
        var cleaned = rot13.replace(/(@\$|\^\^|~@|%\?|\*~|!!|#&)/g, "");
        var step3 = bytesToUtf8(base64ToBytes(cleaned));
        var step4 = "";
        for (var i = 0; i < step3.length; i++) {
          step4 += String.fromCharCode(step3.charCodeAt(i) - 3);
        }
        var reversed = step4.split("").reverse().join("");
        var jsonStr = bytesToUtf8(base64ToBytes(reversed));
        return JSON.parse(jsonStr);
      } catch (_) {
        return null;
      }
    }
    function bytesToWordArray(bytes) {
      var words = [];
      for (var i = 0; i < bytes.length; i++) {
        words[i >>> 2] = (words[i >>> 2] || 0) | (bytes[i] & 255) << 24 - i % 4 * 8;
      }
      return CryptoJS.lib.WordArray.create(words, bytes.length);
    }
    function wordArrayToBytes(wa) {
      var words = wa.words;
      var sigBytes = wa.sigBytes;
      var out = new Uint8Array(sigBytes);
      for (var i = 0; i < sigBytes; i++) {
        out[i] = words[i >>> 2] >>> 24 - i % 4 * 8 & 255;
      }
      return out;
    }
    var RPM_KEY_HEX = "6b69656d7469656e6d75613931316361";
    var RPM_IV_BYTES_PRIMARY = utf8ToBytes("1234567890oiuytr");
    var RPM_IV_BYTES_ALT = utf8ToBytes("123456789oiuytr\0");
    function decryptRpmHex(hexCipher) {
      var clean = String(hexCipher || "").trim();
      if (!clean || clean.length < 32 || !/^[0-9a-fA-F]+$/.test(clean)) return null;
      var keyWA = CryptoJS.enc.Hex.parse(RPM_KEY_HEX);
      var ctWA = CryptoJS.enc.Hex.parse(clean);
      var ivCandidates = [RPM_IV_BYTES_PRIMARY, RPM_IV_BYTES_ALT];
      for (var i = 0; i < ivCandidates.length; i++) {
        try {
          var ivWA = bytesToWordArray(ivCandidates[i]);
          var decryptedWA = CryptoJS.AES.decrypt(
            { ciphertext: ctWA },
            keyWA,
            { iv: ivWA, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
          );
          if (decryptedWA && decryptedWA.sigBytes > 0) {
            var txt = bytesToUtf8(wordArrayToBytes(decryptedWA)).trim();
            if (txt.charAt(0) === "{") {
              return JSON.parse(txt);
            }
          }
        } catch (_) {
        }
      }
      return null;
    }
    function aes256EcbBlock(keyWA, block16) {
      var encrypted = CryptoJS.AES.encrypt(
        bytesToWordArray(block16),
        keyWA,
        { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding }
      );
      return wordArrayToBytes(encrypted.ciphertext);
    }
    function gf128Mul(x, y) {
      var z = new Uint8Array(16);
      var v = new Uint8Array(y);
      for (var i = 0; i < 16; i++) {
        for (var b = 7; b >= 0; b--) {
          if (x[i] >>> b & 1) {
            for (var k = 0; k < 16; k++) z[k] ^= v[k];
          }
          var lsb = v[15] & 1;
          for (var s = 15; s > 0; s--) {
            v[s] = v[s] >>> 1 | (v[s - 1] & 1) << 7;
          }
          v[0] = v[0] >>> 1;
          if (lsb) v[0] ^= 225;
        }
      }
      return z;
    }
    function ghashEmptyAad(h, ciphertext) {
      var y = new Uint8Array(16);
      for (var off = 0; off < ciphertext.length; off += 16) {
        var end = Math.min(off + 16, ciphertext.length);
        for (var i = 0; i < end - off; i++) {
          y[i] ^= ciphertext[off + i];
        }
        y = gf128Mul(y, h);
      }
      var lenBlock = new Uint8Array(16);
      var bitLen = ciphertext.length * 8;
      var hi = Math.floor(bitLen / 4294967296);
      var lo = bitLen >>> 0;
      lenBlock[8] = hi >>> 24 & 255;
      lenBlock[9] = hi >>> 16 & 255;
      lenBlock[10] = hi >>> 8 & 255;
      lenBlock[11] = hi & 255;
      lenBlock[12] = lo >>> 24 & 255;
      lenBlock[13] = lo >>> 16 & 255;
      lenBlock[14] = lo >>> 8 & 255;
      lenBlock[15] = lo & 255;
      for (var j = 0; j < 16; j++) y[j] ^= lenBlock[j];
      return gf128Mul(y, h);
    }
    function aes256GcmDecryptPure(keyBytes, ivBytes, cipherAndTag) {
      if (keyBytes.length !== 32 || ivBytes.length !== 12 || cipherAndTag.length <= 16) {
        return null;
      }
      var ctLen = cipherAndTag.length - 16;
      var ciphertext = cipherAndTag.subarray(0, ctLen);
      var tag = cipherAndTag.subarray(ctLen);
      var keyWA = bytesToWordArray(keyBytes);
      var h = aes256EcbBlock(keyWA, new Uint8Array(16));
      var j0 = new Uint8Array(16);
      j0.set(ivBytes, 0);
      j0[15] = 1;
      var s = ghashEmptyAad(h, ciphertext);
      var tagMask = aes256EcbBlock(keyWA, j0);
      var diff = 0;
      for (var i = 0; i < 16; i++) {
        diff |= s[i] ^ tagMask[i] ^ tag[i];
      }
      if (diff !== 0) return null;
      var cb = new Uint8Array(j0);
      var plain = new Uint8Array(ctLen);
      for (var off = 0; off < ctLen; off += 16) {
        for (var idx = 15; idx >= 12; idx--) {
          cb[idx] = cb[idx] + 1 & 255;
          if (cb[idx] !== 0) break;
        }
        var ks = aes256EcbBlock(keyWA, cb);
        var take = Math.min(16, ctLen - off);
        for (var k = 0; k < take; k++) {
          plain[off + k] = ciphertext[off + k] ^ ks[k];
        }
      }
      return plain;
    }
    function decryptBysePlayback(playback, forcePureJs) {
      return __async(this, null, function* () {
        if (!playback || playback.algorithm !== "AES-256-GCM") return null;
        if (!Array.isArray(playback.key_parts) || !playback.iv || !playback.payload) return null;
        var tryIndices = [];
        var v = parseInt(playback.version, 10);
        if (Number.isInteger(v) && v >= 1 && v <= playback.key_parts.length && 30 - v < playback.key_parts.length) {
          tryIndices.push([v - 1, 30 - v]);
        }
        for (var i = 0; i < tryIndices.length; i++) {
          var idx1 = tryIndices[i][0];
          var idx2 = tryIndices[i][1];
          try {
            var part1 = base64ToBytes(playback.key_parts[idx1]);
            var part2 = base64ToBytes(playback.key_parts[idx2]);
            var key = new Uint8Array(part1.length + part2.length);
            key.set(part1, 0);
            key.set(part2, part1.length);
            var iv = base64ToBytes(playback.iv);
            var buf = base64ToBytes(playback.payload);
            if (key.length !== 32 || iv.length !== 12 || buf.length <= 16) continue;
            if (!forcePureJs && typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle && typeof globalThis.crypto.subtle.decrypt === "function") {
              try {
                var cryptoKey = yield globalThis.crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["decrypt"]);
                var plainBuf = yield globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, cryptoKey, buf);
                return JSON.parse(bytesToUtf8(new Uint8Array(plainBuf)));
              } catch (_) {
              }
            }
            var plainPure = aes256GcmDecryptPure(key, iv, buf);
            if (plainPure) {
              return JSON.parse(bytesToUtf8(plainPure));
            }
          } catch (_) {
          }
        }
        return null;
      });
    }
    module2.exports = {
      _seed,
      _generator,
      unpackNetMoziPayload,
      resolveNetMoziContent,
      unpackPacker,
      generalUnpack,
      decodeHunter: decodeHunter2,
      decodeVoePayload,
      decryptRpmHex,
      aes256GcmDecryptPure,
      decryptBysePlayback
    };
  }
});

// src/_data/magyar_nepmesek_episodes.json
var require_magyar_nepmesek_episodes = __commonJS({
  "src/_data/magyar_nepmesek_episodes.json"(exports2, module2) {
    module2.exports = {
      "1": [
        {
          ep: 1,
          title: "Kacor kir\xE1ly"
        },
        {
          ep: 2,
          title: "A s\xF3"
        },
        {
          ep: 3,
          title: "A sz\xE1ll\xE1st k\xE9r\u0151 r\xF3ka"
        },
        {
          ep: 4,
          title: "A kismalac \xE9s a farkasok"
        },
        {
          ep: 5,
          title: "A kis g\xF6mb\xF6c"
        },
        {
          ep: 6,
          title: "R\xF3ka koma"
        },
        {
          ep: 7,
          title: "A macskacic\xF3"
        },
        {
          ep: 8,
          title: "Eb, aki a kanal\xE1t meg nem eszi"
        },
        {
          ep: 9,
          title: "Z\xF6ld P\xE9ter"
        },
        {
          ep: 10,
          title: "M\xE9hek a vonaton"
        },
        {
          ep: 11,
          title: "Az \xE9gig \xE9r\u0151 paszuly"
        },
        {
          ep: 12,
          title: "A kicsi di\xF3"
        },
        {
          ep: 13,
          title: "A szeg\xE9ny csizmadia \xE9s a sz\xE9lkir\xE1ly"
        }
      ],
      "2": [
        {
          ep: 14,
          title: "Kir\xE1ly kis Mikl\xF3s"
        },
        {
          ep: 15,
          title: "Az \xE9gig \xE9r\u0151 fa"
        },
        {
          ep: 16,
          title: "A cs\xF3kale\xE1nyok"
        },
        {
          ep: 17,
          title: "A k\xE9t koma"
        },
        {
          ep: 18,
          title: "A kir\xE1lykisasszony jegyei"
        },
        {
          ep: 19,
          title: "A k\xE9t aranyhaj\xFA fi\xFA"
        },
        {
          ep: 20,
          title: "A r\xF3kaszem\u0171 menyecske"
        },
        {
          ep: 21,
          title: "A b\xEDr\xF3 okos l\xE1nya"
        },
        {
          ep: 22,
          title: "A csillagszem\u0171 juh\xE1sz"
        },
        {
          ep: 23,
          title: "Hamupip\u0151ke kir\xE1lyfi"
        },
        {
          ep: 24,
          title: "Egyszem\u0171, k\xE9tszem\u0171, h\xE1romszem\u0171"
        },
        {
          ep: 25,
          title: "A r\xE1t\xF3ti csik\xF3toj\xE1s"
        },
        {
          ep: 26,
          title: "A pulikutya"
        }
      ],
      "3": [
        {
          ep: 27,
          title: "Holl\xF3 Jank\xF3"
        },
        {
          ep: 28,
          title: "A t\u0171, a kutya, a r\xE1k, a toj\xE1s \xE9s a kakas v\xE1ndor\xFAtja"
        },
        {
          ep: 29,
          title: "El\u0151bb a t\xE1nc azut\xE1n a lakoma"
        },
        {
          ep: 30,
          title: "\xC1belesz-k\xF3belesz"
        },
        {
          ep: 31,
          title: "A szeg\xE9ny ember sz\u0151l\u0151je"
        },
        {
          ep: 32,
          title: "A sz\xE9kely asszony \xE9s az \xF6rd\xF6g"
        },
        {
          ep: 33,
          title: "A mindent j\xE1r\xF3 malmocska"
        },
        {
          ep: 34,
          title: "Di\xF3d\xE9nes"
        },
        {
          ep: 35,
          title: "Pink\xF3"
        },
        {
          ep: 36,
          title: "A s\xFCndiszn\xF3"
        },
        {
          ep: 37,
          title: "A szorgalmas \xE9s a rest le\xE1ny"
        },
        {
          ep: 38,
          title: "A csillag\xE1sz, a lop\xF3, a vad\xE1sz meg a szab\xF3"
        },
        {
          ep: 39,
          title: "A tall\xE9ros kalap"
        }
      ],
      "4": [
        {
          ep: 40,
          title: "A mezei ny\xFAl \xE9s a s\xFCndiszn\xF3"
        },
        {
          ep: 41,
          title: "Az \xE1llatok besz\xE9de"
        },
        {
          ep: 42,
          title: "A h\xE9t kecskegida"
        },
        {
          ep: 43,
          title: "Pirosmalac"
        },
        {
          ep: 44,
          title: "Kecskekatonas\xE1g (K.u.K.)"
        },
        {
          ep: 45,
          title: "A bugyuta ember"
        },
        {
          ep: 46,
          title: "A b\xE9ka, a kolb\xE1sz \xE9s az eg\xE9r"
        },
        {
          ep: 47,
          title: "A medve \xE9s a macska"
        },
        {
          ep: 48,
          title: "A szeg\xE9ny ember kilenc ty\xFAkja \xE9s kakasa"
        },
        {
          ep: 49,
          title: "Pelik\xE1nmad\xE1r"
        },
        {
          ep: 50,
          title: "A gazdag ember h\xE1rom fia"
        },
        {
          ep: 51,
          title: "A h\xF3lyag, a szalmasz\xE1l \xE9s a t\xFCzes \xFCsz\xF6k"
        },
        {
          ep: 52,
          title: "A kir\xE1ly kenyere"
        }
      ],
      "5": [
        {
          ep: 53,
          title: "A katona szerencs\xE9je"
        },
        {
          ep: 54,
          title: "Koplal\xF3 M\xE1ty\xE1s"
        },
        {
          ep: 55,
          title: "A banya"
        },
        {
          ep: 56,
          title: "Pr\xFCcs\xF6k"
        },
        {
          ep: 57,
          title: "A k\u0151leves"
        },
        {
          ep: 58,
          title: "A halhatatlans\xE1gra v\xE1gy\xF3 kir\xE1lyfi"
        },
        {
          ep: 59,
          title: "A pityke \xE9s a k\xF6k\xE9ny"
        },
        {
          ep: 60,
          title: "Tancika Marcika"
        },
        {
          ep: 61,
          title: "P\xE9ter \xE9s P\xE1l"
        },
        {
          ep: 62,
          title: "A kir\xE1lykisasszony cip\u0151je"
        },
        {
          ep: 63,
          title: "Hamupip\u0151ke"
        },
        {
          ep: 64,
          title: "Tr\xE9f\xE1s farkas"
        },
        {
          ep: 65,
          title: "A kir\xE1ly, aki nem akarja f\xE9rjhez adni a l\xE1ny\xE1t"
        }
      ],
      "6": [
        {
          ep: 66,
          title: "A szeg\xE9ny ember heged\u0171je"
        },
        {
          ep: 67,
          title: "A k\xE9kfest\u0151inas"
        },
        {
          ep: 68,
          title: "Hetet egy csap\xE1sra"
        },
        {
          ep: 69,
          title: "A kerek k\u0151"
        },
        {
          ep: 70,
          title: "A k\u0151v\xE9 v\xE1lt kir\xE1lyfi"
        },
        {
          ep: 71,
          title: "Szeg\xE9ny ember meg a lova"
        },
        {
          ep: 72,
          title: "A kis kakas \xE9s a s\xF6v\xE9ny"
        },
        {
          ep: 73,
          title: "A papucsszaggat\xF3 kir\xE1lykisasszonyok"
        },
        {
          ep: 74,
          title: "Angyalb\xE1r\xE1nyok"
        },
        {
          ep: 75,
          title: "Szusza"
        },
        {
          ep: 76,
          title: "Az aranysz\u0151r\u0171 b\xE1r\xE1ny"
        },
        {
          ep: 77,
          title: "A b\u0171b\xE1jos lakat"
        },
        {
          ep: 78,
          title: "Cerceruska"
        }
      ],
      "7": [
        {
          ep: 79,
          title: "A h\xE1rom\xE1g\xFA t\xF6lgyfa t\xFCnd\xE9re"
        },
        {
          ep: 80,
          title: "Gy\xF6ngyvir\xE1g Palk\xF3"
        },
        {
          ep: 81,
          title: "A v\xEDz t\xFCnd\xE9re"
        },
        {
          ep: 82,
          title: "F\xE1b\xF3l faragott P\xE9ter"
        },
        {
          ep: 83,
          title: "Hogyan telt a gyermekkorom"
        },
        {
          ep: 84,
          title: "Kiskond\xE1s"
        },
        {
          ep: 85,
          title: "Ny\xFAlp\xE1sztor"
        }
      ],
      "8": [
        {
          ep: 86,
          title: "Az el\xE1tkozott kast\xE9ly"
        },
        {
          ep: 87,
          title: "Az aranyborny\xFA"
        },
        {
          ep: 88,
          title: "K\xF6cs\xF6gkir\xE1ly"
        },
        {
          ep: 89,
          title: "Marci \xE9s az el\xE1tkozott kir\xE1lyl\xE1ny"
        }
      ],
      "9": [
        {
          ep: 90,
          title: "Hal\xE1sz J\xE1nos"
        },
        {
          ep: 91,
          title: "A k\u0151sz\xEDv\u0171 ember"
        },
        {
          ep: 92,
          title: "Sz\xF3l\xF3 sz\u0151l\u0151, mosolyg\xF3 alma, cseng\u0151 barack"
        },
        {
          ep: 93,
          title: "A selyemr\xE9t"
        },
        {
          ep: 94,
          title: "S\xE1rk\xE1ny\xF6l\u0151 Sebesty\xE9n"
        },
        {
          ep: 95,
          title: "M\xE9sz\xE1ros Gyuri"
        },
        {
          ep: 96,
          title: "Az el\xE9gedetlen faz\xE9k"
        },
        {
          ep: 97,
          title: "A csudamad\xE1r"
        },
        {
          ep: 98,
          title: "A szeg\xE9ny ember \xE9s a kutyacska"
        },
        {
          ep: 99,
          title: "A rest leg\xE9nyr\u0151l"
        },
        {
          ep: 100,
          title: "M\xE1ty\xE1s kir\xE1ly aranysz\u0151r\u0171 b\xE1r\xE1nya"
        }
      ]
    };
  }
});

// src/_shared/meta.js
var require_meta = __commonJS({
  "src/_shared/meta.js"(exports2, module2) {
    "use strict";
    var { fetchJson, getSetting } = require_http();
    var nepmesekEpisodes = require_magyar_nepmesek_episodes();
    var DEFAULT_TMDB_API_KEY = "ffe7ef8916c61835264d2df68276ddc2";
    var META_CACHE_TTL_MS = 6 * 60 * 60 * 1e3;
    var MAX_META_CACHE = 200;
    var metaCache = {};
    var TENKES_KAPITANYA_EPISODES = {
      1: "A v\xE9rd\xEDj",
      2: "Az embervad\xE1szat",
      3: "Buga Jakab",
      4: "A t\u0151zs\xE9r",
      5: "A fejvad\xE1sz",
      6: "A katona szerencs\xE9je",
      7: "Kett\u0151s k\xE9m",
      8: "A k\xE9mszemle",
      9: "A meglepet\xE9s",
      10: "A v\xF6r\xF6s \xF6rd\xF6g\xF6k",
      11: "A hadicsel",
      12: "A fogoly",
      13: "A v\xE1r ostroma"
    };
    var HOHO_HORGASZ_EPISODES = {
      1: {
        1: "Reszkessetek halacsk\xE1k",
        2: "A csalafinta csali",
        3: "A rep\xFCl\u0151 hal",
        4: "A s\xF6t\xE9tlelk\u0171 orvhorg\xE1sz",
        5: "Sz\xFClet\xE9snapi aj\xE1nd\xE9k",
        6: "A gumihal",
        7: "A fal\xE1nk pelik\xE1n",
        8: "Az \xE9jszakai horg\xE1szat",
        9: "Tekn\u0151sh\xE1ton lovagolva",
        10: "A mindentv\xE1g\xF3 r\xE1koll\xF3",
        11: "A titokzatos b\xE9kaember",
        12: "N\xE1szaj\xE1nd\xE9k",
        13: "Vir\xE1gcsokor a horgon"
      },
      2: {
        1: "Horg\xE1sz a tet\u0151n",
        2: "Horg\xE1sz a k\xE9m\xE9nyben",
        3: "Sz\xE1lka hal n\xE9lk\xFCl",
        4: "A megsz\xF6k\xF6tt m\u0171hal",
        5: "Csecsem\u0151altat\xF3 horg\xE1szbot",
        6: "Horg\xE1sz a halpiacon",
        7: "Mit hozott a Mikul\xE1s",
        8: "A kar\xE1csonyi hal",
        9: "A holl\xF3 \xE9s a hal",
        10: "Hov\xE1 t\u0171nt a horg\xE1szzsin\xF3r",
        11: "K\xE9toldali horg\xE1szl\xE1z",
        12: "A fagyasztott hal",
        13: "Az eldugult mosogat\xF3"
      }
    };
    var PRELOADED_HUNGARIAN_TITLES = {
      tt0129719: { hu: "S\xFCs\xFC, a s\xE1rk\xE1ny kalandjai", en: "S\xFCs\xFC, the Dragon", year: "1977", runtime: 30 },
      tt0056789: { hu: "A Tenkes kapit\xE1nya", en: "Captain Tenkes", year: "1964", runtime: 25 },
      tt0861751: { hu: "Magyar n\xE9pmes\xE9k", en: "Hungarian Folk Tales", year: "1980", runtime: 10 },
      tt0136650: { hu: "\xDCzenet a j\xF6v\u0151b\u0151l - A M\xE9zga csal\xE1d", en: "The M\xE9zga Family", year: "1969", runtime: 25 },
      tt1225872: { hu: "Vak\xE1ci\xF3n a M\xE9zga csal\xE1d", en: "The M\xE9zga Family on Holiday", year: "1978", runtime: 25 },
      tt0167595: { hu: "Frakk, a macsk\xE1k r\xE9me", en: "Frakk, the Cats' Nightmare", year: "1971", runtime: 10 },
      tt0168342: { hu: "Kukori \xE9s Kotkoda", en: "Kukori and Kotkoda", year: "1971", runtime: 10 },
      tt0154077: { hu: "A nagy ho-ho-horg\xE1sz", en: "The Great Ho-ho-ho-angler", year: "1982", runtime: 10 },
      tt0166931: { hu: "Pom-Pom mes\xE9i", en: "Tales of Pom Pom", year: "1980", runtime: 10 },
      tt0168343: { hu: "K\xE9rem a k\xF6vetkez\u0151t! (Dr. Bub\xF3)", en: "Next, Please!", year: "1974", runtime: 10 },
      tt0179955: { hu: "Macskafog\xF3", en: "Cat City", year: "1986", runtime: 96 },
      tt0257290: { hu: "\xDCvegtigris", en: "Glass Tiger", year: "2001", runtime: 104 },
      tt0065067: { hu: "A tan\xFA", en: "The Witness", year: "1969", runtime: 103 },
      tt0121403: { hu: "Indul a bakterh\xE1z", en: "The Station Master", year: "1980", runtime: 66 },
      tt0303184: { hu: "Valami Amerika", en: "A Kind of America", year: "2002", runtime: 115 },
      tt0069697: { hu: "K\xFCl\xF6nben d\xFChbe j\xF6v\xFCnk", en: "Watch Out, We're Mad", year: "1974", runtime: 102 },
      tt0085327: { hu: "Kincs, ami nincs", en: "Who Finds a Friend Finds a Treasure", year: "1981", runtime: 102 },
      tt0131636: { hu: "Vuk", en: "The Little Fox", year: "1981", runtime: 76 },
      tt8111088: { hu: "A Mandal\xF3ri", en: "The Mandalorian", year: "2019", runtime: 40 },
      tt0268380: { hu: "J\xE9gkorszak", en: "Ice Age", year: "2002", runtime: 81 },
      tt0060196: { hu: "A J\xF3, a Rossz \xE9s a Cs\xFAf", en: "The Good, the Bad and the Ugly", year: "1966", runtime: 161 },
      tt0848228: { hu: "Bossz\xFA\xE1ll\xF3k", en: "The Avengers", year: "2012", runtime: 143 }
    };
    function normalizeTitle2(str) {
      var s = String(str || "").toLowerCase();
      if (typeof s.normalize === "function") {
        s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      }
      return s.replace(/[áàâäã]/g, "a").replace(/[éèêë]/g, "e").replace(/[íìîï]/g, "i").replace(/[óòôöőõ]/g, "o").replace(/[úùûüűũ]/g, "u").replace(/ß/g, "ss").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    }
    function escapeRegExp2(str) {
      return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    function normalizeMediaType(mediaType) {
      var t = String(mediaType || "").toLowerCase();
      if (t === "tv" || t === "series" || t === "show") return "series";
      return "movie";
    }
    function getClassicEpisodeTitle(imdbId, hungarianTitle, season, episode) {
      if (!season || !episode) return "";
      var s = parseInt(season, 10);
      var e = parseInt(episode, 10);
      var normHu = normalizeTitle2(hungarianTitle || "");
      if (imdbId === "tt0056789" || normHu.indexOf("tenkes") !== -1) {
        return TENKES_KAPITANYA_EPISODES[e] || "";
      }
      if (imdbId === "tt0154077" || normHu.indexOf("horgasz") !== -1) {
        return HOHO_HORGASZ_EPISODES[s] && HOHO_HORGASZ_EPISODES[s][e] || "";
      }
      if (imdbId === "tt0861751" || normHu.indexOf("nepmese") !== -1) {
        var list = nepmesekEpisodes[String(s)];
        if (Array.isArray(list)) {
          var found = list.find(function(item) {
            return item && item.ep === e;
          }) || list[e - 1];
          if (found && found.title) return found.title;
        }
      }
      return "";
    }
    function resolveHungarianTitleViaWiki(englishTitle, imdbId) {
      return __async(this, null, function* () {
        if (!englishTitle) return null;
        try {
          if (imdbId && /^tt\d+$/.test(imdbId)) {
            var sparql = 'SELECT ?huLabel WHERE { ?item wdt:P345 "' + imdbId + '". ?item rdfs:label ?huLabel. FILTER(LANG(?huLabel)="hu") } LIMIT 1';
            var wd = yield fetchJson(
              "https://query.wikidata.org/sparql?query=" + encodeURIComponent(sparql) + "&format=json",
              { headers: { Accept: "application/json" } },
              2500
            );
            var huVal = wd && wd.results && wd.results.bindings && wd.results.bindings[0] && wd.results.bindings[0].huLabel && wd.results.bindings[0].huLabel.value;
            if (huVal) return huVal.trim();
          }
        } catch (_) {
        }
        return null;
      });
    }
    function cleanWikiOrTmdbTitle(title) {
      return String(title || "").replace(/\s*\([^)]*\)\s*$/g, "").trim();
    }
    var metaInflight = {};
    function resolveMediaMeta2(rawId, mediaType, season, episode) {
      return __async(this, null, function* () {
        var idStr = String(rawId || "").trim();
        if (!idStr) return null;
        var type = normalizeMediaType(mediaType);
        var isSeries = type === "series" || season != null && episode != null;
        var sNum = isSeries && season != null && season !== "" ? parseInt(season, 10) : void 0;
        var eNum = isSeries && episode != null && episode !== "" ? parseInt(episode, 10) : void 0;
        if (isNaN(sNum)) sNum = void 0;
        if (isNaN(eNum)) eNum = void 0;
        var cacheKey = [idStr, type, sNum || "", eNum || ""].join(":");
        var cached = metaCache[cacheKey];
        if (cached && Date.now() - cached.ts < META_CACHE_TTL_MS) {
          return cached.data;
        }
        if (metaInflight[cacheKey]) {
          return yield metaInflight[cacheKey];
        }
        var p = resolveMediaMetaUncached(idStr, type, isSeries, sNum, eNum, cacheKey);
        metaInflight[cacheKey] = p;
        try {
          return yield p;
        } finally {
          delete metaInflight[cacheKey];
        }
      });
    }
    function resolveMediaMetaUncached(idStr, type, isSeries, sNum, eNum, cacheKey) {
      return __async(this, null, function* () {
        var apiKey = getSetting("tmdbApiKey", DEFAULT_TMDB_API_KEY);
        var tmdbId = "";
        var imdbId = "";
        var hungarianTitle = "";
        var englishTitle = "";
        var year = "";
        var runtimeMinutes = null;
        var episodeTitle = "";
        if (idStr.indexOf("netmozi:") === 0 || idStr.indexOf("mediaklikk:") === 0) {
          var directMeta = {
            id: idStr,
            tmdbId: "",
            imdbId: idStr,
            type,
            hungarianTitle: "",
            englishTitle: "",
            year: "",
            runtimeMinutes: null,
            season: sNum,
            episode: eNum,
            episodeTitle: ""
          };
          return directMeta;
        }
        if (/^tt\d+$/i.test(idStr)) {
          imdbId = idStr.toLowerCase();
        } else {
          tmdbId = idStr.replace(/^tmdb:/i, "").trim();
        }
        if (imdbId && PRELOADED_HUNGARIAN_TITLES[imdbId]) {
          var pre = PRELOADED_HUNGARIAN_TITLES[imdbId];
          hungarianTitle = pre.hu;
          englishTitle = pre.en || pre.hu;
          year = pre.year || "";
          runtimeMinutes = pre.runtime || null;
        }
        if (tmdbId && /^\d+$/.test(tmdbId)) {
          var endpoint = isSeries ? "tv/" + tmdbId : "movie/" + tmdbId;
          var tmdbData = yield fetchJson(
            "https://api.themoviedb.org/3/" + endpoint + "?api_key=" + encodeURIComponent(apiKey) + "&language=hu-HU&append_to_response=external_ids",
            null,
            3500
          );
          if (tmdbData) {
            if (!imdbId && tmdbData.external_ids && tmdbData.external_ids.imdb_id) {
              imdbId = tmdbData.external_ids.imdb_id;
            } else if (!imdbId && tmdbData.imdb_id) {
              imdbId = tmdbData.imdb_id;
            }
            if (imdbId && PRELOADED_HUNGARIAN_TITLES[imdbId]) {
              var preTmdb = PRELOADED_HUNGARIAN_TITLES[imdbId];
              hungarianTitle = hungarianTitle || preTmdb.hu;
              englishTitle = englishTitle || preTmdb.en;
              year = year || preTmdb.year;
              runtimeMinutes = runtimeMinutes || preTmdb.runtime;
            }
            hungarianTitle = hungarianTitle || tmdbData.title || tmdbData.name || "";
            englishTitle = englishTitle || tmdbData.original_title || tmdbData.original_name || "";
            if (!year) {
              var rel = tmdbData.release_date || tmdbData.first_air_date || "";
              var ym = String(rel).match(/^(\d{4})/);
              if (ym) year = ym[1];
            }
            if (!runtimeMinutes) {
              if (tmdbData.runtime) runtimeMinutes = parseInt(tmdbData.runtime, 10);
              else if (Array.isArray(tmdbData.episode_run_time) && tmdbData.episode_run_time[0]) {
                runtimeMinutes = parseInt(tmdbData.episode_run_time[0], 10);
              }
            }
            if (isSeries && sNum && eNum) {
              episodeTitle = getClassicEpisodeTitle(imdbId, hungarianTitle, sNum, eNum);
              if (!episodeTitle) {
                var epData = yield fetchJson(
                  "https://api.themoviedb.org/3/tv/" + tmdbId + "/season/" + sNum + "/episode/" + eNum + "?api_key=" + encodeURIComponent(apiKey) + "&language=hu-HU",
                  null,
                  2500
                );
                if (epData && epData.name && !/^epiz[oó]d\s*\d+$/i.test(epData.name) && !/^episode\s*\d+$/i.test(epData.name)) {
                  episodeTitle = epData.name;
                }
                if (!runtimeMinutes && epData && epData.runtime) {
                  runtimeMinutes = parseInt(epData.runtime, 10);
                }
              }
            }
            if (tmdbData.original_language && tmdbData.original_language !== "en" && tmdbData.original_language !== "hu") {
              var enTmdb = yield fetchJson(
                "https://api.themoviedb.org/3/" + endpoint + "?api_key=" + encodeURIComponent(apiKey) + "&language=en-US",
                null,
                2500
              );
              if (enTmdb && (enTmdb.title || enTmdb.name)) {
                englishTitle = enTmdb.title || enTmdb.name;
              }
            }
          }
        }
        if ((!hungarianTitle || !englishTitle) && imdbId && /^tt\d+$/.test(imdbId)) {
          var findData = yield fetchJson(
            "https://api.themoviedb.org/3/find/" + encodeURIComponent(imdbId) + "?api_key=" + encodeURIComponent(apiKey) + "&external_source=imdb_id&language=hu-HU",
            null,
            3e3
          );
          var findHit = findData && ((isSeries ? findData.tv_results : findData.movie_results) || findData.movie_results || findData.tv_results || [])[0];
          if (findHit) {
            tmdbId = tmdbId || String(findHit.id || "");
            hungarianTitle = hungarianTitle || findHit.title || findHit.name || "";
            englishTitle = englishTitle || findHit.original_title || findHit.original_name || "";
            if (!year) {
              var fRel = findHit.release_date || findHit.first_air_date || "";
              var fYm = String(fRel).match(/^(\d{4})/);
              if (fYm) year = fYm[1];
            }
          }
          if (!hungarianTitle || !englishTitle || !year || !runtimeMinutes || isSeries && !episodeTitle) {
            var cmType = isSeries ? "series" : "movie";
            var cmData = yield fetchJson("https://v3-cinemeta.strem.io/meta/" + cmType + "/" + imdbId + ".json", null, 3500);
            var cmMeta = cmData && cmData.meta;
            if (cmMeta) {
              englishTitle = englishTitle || cmMeta.name || "";
              if (!year) {
                var cmY = String(cmMeta.year || cmMeta.releaseInfo || "").match(/(\d{4})/);
                if (cmY) year = cmY[1];
              }
              if (!runtimeMinutes && cmMeta.runtime) {
                var rtMatch = String(cmMeta.runtime).match(/(\d+)/);
                if (rtMatch) runtimeMinutes = parseInt(rtMatch[1], 10);
              }
              if (isSeries && sNum && eNum && !episodeTitle && Array.isArray(cmMeta.videos)) {
                var epObj = cmMeta.videos.find(function(v) {
                  return Number(v.season) === sNum && Number(v.episode) === eNum;
                });
                if (epObj && (epObj.title || epObj.name)) {
                  episodeTitle = epObj.title || epObj.name;
                }
              }
            }
          }
        }
        if (!hungarianTitle && englishTitle) {
          var wdHu = yield resolveHungarianTitleViaWiki(englishTitle, imdbId);
          if (wdHu) hungarianTitle = wdHu;
        }
        if (!hungarianTitle && englishTitle) hungarianTitle = englishTitle;
        if (!englishTitle && hungarianTitle) englishTitle = hungarianTitle;
        hungarianTitle = cleanWikiOrTmdbTitle(hungarianTitle);
        englishTitle = cleanWikiOrTmdbTitle(englishTitle);
        if (isSeries && sNum && eNum && !episodeTitle) {
          episodeTitle = getClassicEpisodeTitle(imdbId, hungarianTitle, sNum, eNum);
        }
        var result = {
          id: imdbId || tmdbId || idStr,
          tmdbId,
          imdbId,
          type: isSeries ? "series" : "movie",
          hungarianTitle,
          englishTitle,
          year,
          runtimeMinutes: Number.isFinite(runtimeMinutes) && runtimeMinutes > 0 ? runtimeMinutes : null,
          season: sNum,
          episode: eNum,
          episodeTitle
        };
        if (hungarianTitle || englishTitle) {
          var keys = Object.keys(metaCache);
          if (keys.length >= MAX_META_CACHE) {
            delete metaCache[keys[0]];
          }
          metaCache[cacheKey] = { ts: Date.now(), data: result };
        }
        return result;
      });
    }
    function generateSearchQueries(meta) {
      var queries = [];
      var add = function(q) {
        if (q && queries.indexOf(q) === -1) queries.push(q);
      };
      var hu = meta.hungarianTitle;
      var en = meta.englishTitle;
      var year = meta.year;
      var s = meta.season;
      var e = meta.episode;
      if (s && e) {
        var sPad = s < 10 ? "0" + s : String(s);
        var ePad = e < 10 ? "0" + e : String(e);
        if (hu) {
          if (meta.episodeTitle) {
            add(hu + " " + meta.episodeTitle);
            add(meta.episodeTitle);
            add(hu + " - " + meta.episodeTitle);
          }
          add(hu + " S" + sPad + "E" + ePad);
          add(hu + " " + s + "x" + e);
          add(hu + " " + s + "x" + ePad);
          add(hu + " " + s + ". evad " + e + ". resz");
          add(hu + " " + e + ". resz");
          add(hu);
        }
        if (en && en !== hu) {
          add(en + " S" + sPad + "E" + ePad);
          add(en + " " + s + "x" + e);
          add(en);
        }
      } else {
        if (hu) {
          add(hu + " teljes film");
          if (year) add(hu + " " + year);
          add(hu + " teljes film magyarul");
          add(hu);
        }
        if (en && en !== hu) {
          add(en + " teljes film");
          if (year) add(en + " " + year);
          add(en);
        }
      }
      return queries;
    }
    var JUNK_TITLE_REGEX = /\b(filmzene|zene|soundtrack|ost|par[oó]dia|f[oő]c[ií]mdal|focimdal|trailer|el[oő]zetes|elozetes|p[aá]rbaj|parbaj|interj[uú]|interju|d[aá]n [aá]llami|nagyd[ií]j|nagydij|id[oő]m[eé]r[oő]|idomero|szabadedz[eé]s|szabadedzes|futam|sprintkvalifik[aá]ci[oó]|boxutca|forma-?1|formula-?1|gameplay|v[eé]gigj[aá]tsz[aá]s|vegigjatszas|[oö]sszefoglal[oó]|osszefoglalo)\b/i;
    function extractUploadYearFromText(text) {
      if (!text || typeof text !== "string") return null;
      var patterns = [
        /<(?:upload_date|created_at|date|pubDate)>[^<]*?\b(20\d{2})\b/i,
        /["'](?:uploadDate|datePublished|upload_date|created_at)["']\s*:\s*["'](20\d{2})/i,
        /\b(20\d{2})[.\-/](?:0[1-9]|1[0-2])[.\-/](?:0[1-9]|[12]\d|3[01])\b/
      ];
      for (var i = 0; i < patterns.length; i++) {
        var m = text.match(patterns[i]);
        if (m && m[1]) {
          var y = parseInt(m[1], 10);
          if (y >= 2005 && y <= 2030) return y;
        }
      }
      return null;
    }
    function extractCandidateYears(candidateTitle, targetTitle) {
      if (!candidateTitle) return [];
      var titleYears = {};
      var reTarget = /\b(19\d\d|20\d\d)\b/g;
      var tm;
      while ((tm = reTarget.exec(String(targetTitle || ""))) !== null) {
        titleYears[parseInt(tm[1], 10)] = true;
      }
      var found = [];
      var reCand = /\b(19\d\d|20\d\d)\b/g;
      var cm;
      while ((cm = reCand.exec(String(candidateTitle))) !== null) {
        var y = parseInt(cm[1], 10);
        if (!titleYears[y]) found.push(y);
      }
      return found;
    }
    function hasVerifiedYearInTitle(candidateTitle, targetYear, targetTitle) {
      if (!targetYear || !candidateTitle) return false;
      var tYear = parseInt(targetYear, 10);
      if (isNaN(tYear)) return false;
      var years = extractCandidateYears(candidateTitle, targetTitle || "");
      return years.some(function(y) {
        return Math.abs(y - tYear) <= 1;
      });
    }
    function isValidRuntime(durationSeconds, meta) {
      if (!durationSeconds || durationSeconds <= 0) return true;
      var isMovie = !meta || meta.type === "movie" || !meta.season;
      if (meta && meta.runtimeMinutes && meta.runtimeMinutes > 0) {
        var targetSec = meta.runtimeMinutes * 60;
        if (isMovie) {
          var palAdjustedSec = Math.round(targetSec * 0.96);
          var minSec = Math.max(1800, palAdjustedSec - 600);
          var maxSec = targetSec + 600;
          return durationSeconds >= minSec && durationSeconds <= maxSec;
        } else {
          var minEp = Math.max(300, Math.round(targetSec * 0.6) - 300);
          var maxEp = Math.round(targetSec * 1.45) + 600;
          return durationSeconds >= minEp && durationSeconds <= maxEp;
        }
      }
      return isMovie ? durationSeconds >= 2400 && durationSeconds <= 18e3 : durationSeconds >= 300 && durationSeconds <= 7200;
    }
    function checkPageMetadata(pageHtml, meta) {
      if (!pageHtml || !meta) return { match: true, verified: false };
      var isMovie = meta.type === "movie" || !meta.season;
      if (meta.imdbId && /^tt\d+$/i.test(meta.imdbId)) {
        var imdbMatches = [];
        var r1 = /imdb\.com\/title\/(tt\d+)/gi;
        var r2 = /\[imdb:(tt\d+)\]/gi;
        var m;
        while ((m = r1.exec(pageHtml)) !== null) imdbMatches.push(m[1].toLowerCase());
        while ((m = r2.exec(pageHtml)) !== null) imdbMatches.push(m[1].toLowerCase());
        if (imdbMatches.length > 0) {
          if (imdbMatches.indexOf(meta.imdbId.toLowerCase()) !== -1) {
            return { match: true, verified: true, reason: "imdb" };
          }
          return { match: false, verified: true, reason: "imdb_mismatch" };
        }
      }
      if (isMovie && meta.year) {
        var tYear = parseInt(meta.year, 10);
        if (!isNaN(tYear)) {
          var yearPatterns = [
            /<span[^>]*class=["'][^"']*\byear\b[^"']*["'][^>]*>\s*(19\d\d|20\d\d)\s*<\/span>/i,
            /<span[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>[^<]*?\b(19\d\d|20\d\d)\b\s*<\/span>/i,
            /(?:Év|Évjárat|Megjelenés(?:\s+éve)?|Kiadás(?:\s+éve)?)\s*:\s*(?:<[^>]+>\s*)*(19\d\d|20\d\d)\b/i,
            /<h1[^>]*>[^<]*?\((19\d\d|20\d\d)\)/i,
            /<title>[^<]*?\((19\d\d|20\d\d)\)/i
          ];
          for (var i = 0; i < yearPatterns.length; i++) {
            var ym = pageHtml.match(yearPatterns[i]);
            if (ym && ym[1]) {
              var pYear = parseInt(ym[1], 10);
              if (Math.abs(pYear - tYear) <= 1) {
                return { match: true, verified: true, reason: "year" };
              }
              return { match: false, verified: true, reason: "year_mismatch" };
            }
          }
        }
      }
      return { match: true, verified: false };
    }
    function isTitleMatch(targetTitle, candidateTitle, targetYear, isSeries) {
      if (!targetTitle || !candidateTitle) return false;
      if (JUNK_TITLE_REGEX.test(candidateTitle)) return false;
      var cleanTarget = String(targetTitle).replace(/\s*[-–:]\s*(a film|the movie|film|sorozat)\s*$/i, "").trim() || targetTitle;
      var normTarget = normalizeTitle2(cleanTarget);
      var normCand = normalizeTitle2(candidateTitle);
      if (!normTarget || !normCand) return false;
      if (!isSeries) {
        var targetHasNumber = /\b([2-9]|ii|iii|iv|v|vi)\b/i.test(normTarget);
        var candHasNumber = /\b([2-9]|ii|iii|iv|v|vi)\b/i.test(normCand);
        if (!targetHasNumber && candHasNumber) return false;
        var sequelSubRe = /\b(ujratoltve|forradalmak|feltamadasok|reloaded|revolutions|resurrections)\b/i;
        if (!sequelSubRe.test(normTarget) && sequelSubRe.test(normCand)) return false;
        if (targetYear) {
          var tYear = parseInt(targetYear, 10);
          if (!isNaN(tYear)) {
            var candYears = extractCandidateYears(normCand, normTarget);
            if (candYears.length > 0 && !candYears.some(function(cy) {
              return Math.abs(cy - tYear) <= 1;
            })) {
              return false;
            }
          }
        }
        if (normTarget.length <= 3) {
          var hasWord = new RegExp("\\b" + escapeRegExp2(normTarget) + "\\b", "i").test(normCand);
          if (!hasWord) return false;
          var hasMovieCue = /\b(film|teljes|mozi|szinkron|szinkronos|magyarul|felirat|feliratos|hd|1080p|720p|brad pitt)\b/i.test(normCand);
          var hasExactYear = targetYear && normCand.indexOf(String(targetYear)) !== -1;
          return Boolean(hasMovieCue || hasExactYear || normCand === normTarget);
        }
      }
      var stopWords = ["egy", "nem", "mint", "hogy", "the", "and", "film", "teljes", "magyarul", "online", "szinkronos"];
      var targetWords = normTarget.split(" ").filter(function(w) {
        return w.length >= 2 && stopWords.indexOf(w) === -1;
      });
      if (targetWords.length === 0) {
        var rawWords = normTarget.split(" ").filter(function(w) {
          return w.length >= 2;
        });
        if (rawWords.length === 0) {
          return new RegExp("\\b" + escapeRegExp2(normTarget) + "\\b", "i").test(normCand);
        }
        return rawWords.every(function(w) {
          return new RegExp("\\b" + escapeRegExp2(w) + "\\b", "i").test(normCand);
        });
      }
      if (targetWords.length === 1 && targetWords[0].length <= 3) {
        return new RegExp("\\b" + escapeRegExp2(targetWords[0]) + "\\b", "i").test(normCand);
      }
      var matched = targetWords.filter(function(w) {
        if (w.length <= 3) return new RegExp("(?:^|\\s)" + escapeRegExp2(w) + "(?:\\s|$)", "i").test(normCand);
        return new RegExp("(?:^|\\s)" + escapeRegExp2(w), "i").test(normCand);
      });
      if (targetWords.length <= 2) {
        return matched.length === targetWords.length;
      }
      return matched.length / targetWords.length >= 0.6;
    }
    function matchesEpisode(title, season, episode, epTitle) {
      if (!season && !episode) return true;
      var t = String(title || "").toLowerCase();
      var sNum = season ? parseInt(season, 10) : null;
      var eNum = episode ? parseInt(episode, 10) : null;
      var evadMatch = t.match(/(\d+)\s*\.?\s*[eé]vad/i) || t.match(/season\s*(\d+)/i);
      if (evadMatch && sNum) {
        var s = parseInt(evadMatch[1], 10);
        if (!isNaN(s) && s !== sNum) return false;
      }
      var seMatch = t.match(/s(\d+)\s*e(\d+)/i) || t.match(/(\d+)x(\d+)/i);
      if (seMatch) {
        var seS = parseInt(seMatch[1], 10);
        var seE = parseInt(seMatch[2], 10);
        return seE === eNum && (!sNum || seS === sNum || isNaN(seS));
      }
      if (sNum && sNum > 1 && !evadMatch) {
        if (epTitle && epTitle.length >= 4 && t.indexOf(epTitle.toLowerCase()) !== -1) {
          return true;
        }
        return false;
      }
      if (epTitle && epTitle.length >= 4 && t.indexOf(epTitle.toLowerCase()) !== -1) {
        return true;
      }
      var reszMatch = t.match(/(\d+)\s*\.?\s*r[eé]sz/i);
      if (reszMatch) {
        return parseInt(reszMatch[1], 10) === eNum;
      }
      var epMatch = t.match(/(\d+)\s*\.?\s*epiz[oó]d/i);
      if (epMatch) {
        return parseInt(epMatch[1], 10) === eNum;
      }
      return true;
    }
    module2.exports = {
      JUNK_TITLE_REGEX,
      TENKES_KAPITANYA_EPISODES,
      HOHO_HORGASZ_EPISODES,
      PRELOADED_HUNGARIAN_TITLES,
      normalizeTitle: normalizeTitle2,
      escapeRegExp: escapeRegExp2,
      normalizeMediaType,
      resolveMediaMeta: resolveMediaMeta2,
      generateSearchQueries,
      extractUploadYearFromText,
      extractCandidateYears,
      hasVerifiedYearInTitle,
      isValidRuntime,
      checkPageMetadata,
      isTitleMatch,
      matchesEpisode
    };
  }
});

// src/_shared/hosters.js
var require_hosters = __commonJS({
  "src/_shared/hosters.js"(exports2, module2) {
    "use strict";
    var {
      base64ToBytes,
      bytesToUtf8,
      decodeHtmlEntities: decodeHtmlEntities2,
      normalizeHttpUrl: normalizeHttpUrl2,
      rc4DecryptBytesToUtf8,
      safeParseUrl
    } = require_bytes();
    var {
      UA,
      fetchJson,
      fetchText: fetchText2,
      getHeader,
      getOrigin,
      safeFetch
    } = require_http();
    var {
      decryptBysePlayback,
      decryptRpmHex,
      decodeVoePayload,
      generalUnpack,
      unpackPacker
    } = require_crypto_decoders();
    var {
      extractUploadYearFromText,
      isValidRuntime
    } = require_meta();
    var DOWNLOAD_ONLY_HOSTS = [
      "frdl.io",
      "fredl.ru",
      "katfile.",
      "uploady.",
      "rapidgator.",
      "turbobit.",
      "nitroflare.",
      "ddownload.",
      "1fichier.",
      "mega.nz",
      "mediafire.com",
      "diablotorrent",
      "myupload.us",
      "filefactory"
    ];
    function isDownloadOnlyHost2(url) {
      var lower = String(url || "").toLowerCase();
      return DOWNLOAD_ONLY_HOSTS.some(function(h) {
        return lower.indexOf(h) !== -1;
      });
    }
    function inferHeight(text, fallback) {
      var s = String(text || "");
      if (/\b2160p?\b|\b4k\b|\buhd\b/i.test(s)) return 2160;
      if (/\b1440p?\b|\b2k\b/i.test(s)) return 1440;
      if (/\b1080p?\b|\bfhd\b|\bfull\s*hd\b/i.test(s)) return 1080;
      if (/\b720p?\b/i.test(s)) return 720;
      if (/\b480p?\b|\bsd\b|\bdvd\b/i.test(s)) return 480;
      if (/\b360p?\b/i.test(s)) return 360;
      return fallback || 720;
    }
    function parseQualityHeight(qualityOrUrl, fallback) {
      if (typeof qualityOrUrl === "number" && Number.isFinite(qualityOrUrl)) return qualityOrUrl;
      var m = String(qualityOrUrl || "").match(/(\d{3,4})/);
      if (m) return parseInt(m[1], 10);
      return fallback || 720;
    }
    function normalizeLanguageLabel(lang) {
      var s = String(lang || "").trim();
      if (!s) return "Magyar Szinkron";
      return s;
    }
    function getLangRank(langLabel) {
      var l = String(langLabel || "").toLowerCase();
      if (l.indexOf("felirat") !== -1 || l.indexOf("sub") !== -1) return 1;
      if (l.indexOf("k\xFClf\xF6ldi") !== -1 || l.indexOf("kulfoldi") !== -1 || l.indexOf("eng") !== -1) return 2;
      return 0;
    }
    function cleanHeaders(headers) {
      if (!headers || typeof headers !== "object") return void 0;
      var out = {};
      var count = 0;
      for (var k in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, k) && headers[k]) {
          var lk = k.toLowerCase();
          if (lk === "x-forwarded-for" || lk === "x-real-ip" || lk === "client-ip") continue;
          out[k] = String(headers[k]);
          count++;
        }
      }
      return count > 0 ? out : void 0;
    }
    function buildNuvioStream(opts) {
      var rawUrl = normalizeHttpUrl2(opts && opts.url);
      if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) return null;
      var height = parseQualityHeight(opts.height || opts.quality, 720);
      var qStr = opts.quality && /^\d{3,4}p$/i.test(String(opts.quality)) ? String(opts.quality) : height + "p";
      var isHls = opts.isHls != null ? Boolean(opts.isHls) : /\.m3u8(\?|$)/i.test(rawUrl);
      var mediaType = isHls ? "hls" : "mp4";
      var kindBadge = isHls ? "HLS" : "MP4";
      var provider = opts.provider || "Magyar";
      var hoster = opts.hoster || "";
      var language = normalizeLanguageLabel(opts.language);
      var langSuffix = getLangRank(language) === 1 ? " (Felirat)" : getLangRank(language) === 2 ? " (ENG)" : "";
      var sourceLabel = hoster && provider.toLowerCase().indexOf(hoster.toLowerCase()) === -1 ? provider + " (" + hoster + ")" : provider || hoster || "Magyar";
      var name = "\u{1F1ED}\u{1F1FA} " + qStr + " " + kindBadge + langSuffix + " \u2022 " + sourceLabel;
      var titlePrefix = opts.title ? opts.title + " \u2022 " : "";
      var title = titlePrefix + sourceLabel + " \u2022 " + qStr + " " + kindBadge + " \u2022 " + language;
      var streamObj = {
        name,
        title,
        url: rawUrl,
        quality: qStr,
        language,
        provider,
        type: mediaType,
        _height: height,
        _langRank: getLangRank(language)
      };
      var reqHeaders = cleanHeaders(opts.headers);
      if (reqHeaders) streamObj.headers = reqHeaders;
      return streamObj;
    }
    function canonicalStreamKey(url) {
      var raw = String(url || "").trim();
      var videaM = raw.match(/(?:videa|videakid)\.hu\/static\/[^/]+\/([0-9.]+)/i);
      if (videaM) return "videa-upload:" + videaM[1];
      var indaM = raw.match(/indavideo\.hu\/indavideo\/([0-9\/]+\/[^/?]+?)(?:\.\d{3,4})?\.mp4/i);
      if (indaM) return "inda-upload:" + indaM[1];
      return "url:" + raw.split("#")[0];
    }
    function pruneTierByQuality(list) {
      if (!list || list.length <= 1) return list || [];
      var maxH = 0;
      for (var i = 0; i < list.length; i++) {
        if (list[i]._height > maxH) maxH = list[i]._height;
      }
      var minAllowed = 0;
      if (maxH >= 720) minAllowed = 720;
      else if (maxH >= 480) minAllowed = 480;
      else if (maxH >= 360) minAllowed = 360;
      if (minAllowed === 0) return list;
      var filtered = list.filter(function(s) {
        return s._height >= minAllowed;
      });
      return filtered.length > 0 ? filtered : list;
    }
    function sortStreamsInPlace(arr) {
      arr.sort(function(a, b) {
        if (a._langRank !== b._langRank) return a._langRank - b._langRank;
        if (a._height !== b._height) return b._height - a._height;
        if (a.type !== b.type) return a.type === "hls" ? -1 : 1;
        return 0;
      });
    }
    function finalizeStreams2(streams, opts) {
      if (!Array.isArray(streams)) return [];
      var maxStreams = opts && typeof opts.maxStreams === "number" && opts.maxStreams > 0 ? opts.maxStreams : 10;
      var normalized = [];
      for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        if (!s || typeof s.url !== "string" || !/^https?:\/\//i.test(s.url)) continue;
        normalized.push({
          name: s.name,
          title: s.title,
          url: s.url.trim(),
          quality: s.quality,
          language: s.language,
          provider: s.provider,
          type: s.type,
          headers: s.headers,
          _height: s._height || parseQualityHeight(s.quality, 720),
          _langRank: s._langRank != null ? s._langRank : getLangRank(s.language)
        });
      }
      sortStreamsInPlace(normalized);
      var seenUrls = {};
      var seenAssets = {};
      var deduped = [];
      for (var d = 0; d < normalized.length; d++) {
        var item = normalized[d];
        var assetKey = canonicalStreamKey(item.url);
        if (seenUrls[item.url] || seenAssets[assetKey]) continue;
        seenUrls[item.url] = true;
        seenAssets[assetKey] = true;
        deduped.push(item);
      }
      var tier0 = [];
      var tier1 = [];
      var tier2 = [];
      for (var k = 0; k < deduped.length; k++) {
        var r = deduped[k]._langRank;
        if (r === 0) tier0.push(deduped[k]);
        else if (r === 1) tier1.push(deduped[k]);
        else tier2.push(deduped[k]);
      }
      tier0 = pruneTierByQuality(tier0);
      tier1 = pruneTierByQuality(tier1);
      tier2 = pruneTierByQuality(tier2);
      var hasHuHd = tier0.some(function(s2) {
        return s2._height >= 720;
      });
      var huFhdCount = tier0.filter(function(s2) {
        return s2._height >= 1080;
      }).length;
      if (huFhdCount >= 2) {
        var compacted = [];
        var kept720 = 0;
        for (var t = 0; t < tier0.length; t++) {
          if (tier0[t]._height >= 1080) {
            compacted.push(tier0[t]);
          } else if (kept720 < 3) {
            compacted.push(tier0[t]);
            kept720++;
          }
        }
        tier0 = compacted;
      }
      if (hasHuHd) {
        tier2 = [];
        if (tier1.length > 2) tier1 = tier1.slice(0, 2);
      }
      var combined = tier0.concat(tier1, tier2);
      sortStreamsInPlace(combined);
      if (combined.length > maxStreams) {
        combined = combined.slice(0, maxStreams);
      }
      return combined.map(function(s2) {
        var clean = {
          name: s2.name,
          title: s2.title,
          url: s2.url,
          quality: s2.quality,
          language: s2.language,
          provider: s2.provider,
          type: s2.type
        };
        if (s2.headers) clean.headers = s2.headers;
        return clean;
      });
    }
    var VIDEA_STATIC_SECRET = "xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJIS4NasXWKy1td7p";
    function computeVideaParams(_xt) {
      var e = String(_xt || "").split("");
      var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      var t = "";
      for (var i = 0; i < 8; i++) {
        t += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      var c = {};
      var r = ["e", "a", "g", "j", "d", "c", "h", "i", "b", "f"];
      for (var j = 0; j < e.length; j++) {
        if (j % 8 === 0) c[r[Math.floor(j / 8) + 1]] = "";
        c[r[Math.floor(j / 8) + 1]] += e[j];
      }
      c[r[0]] = t;
      var d = (c.a || "") + (c.g || "") + (c.j || "") + (c.d || "");
      var u = (c.c || "") + (c.h || "") + (c.i || "") + (c.b || "");
      var m = "";
      for (var k = 0; k < d.length; k++) {
        m += u.charAt(k - (VIDEA_STATIC_SECRET.indexOf(d.charAt(k)) - 31));
      }
      r = ["f", "h", "c", "b", "i"];
      for (var x = 0; x < m.length; x++) {
        if (x % 8 === 0) c[r[Math.floor(x / 8) + 1]] = "";
        c[r[Math.floor(x / 8) + 1]] += m.charAt(x);
      }
      c[r[0]] = "";
      return {
        _s: c.e || "",
        _t: (c.h || "") + (c.c || ""),
        buildKey: function(xs) {
          return (c.b || "") + (c.i || "") + (c.e || "") + (xs || "");
        }
      };
    }
    function parseVideaXml(xmlStr, htmlStr, baseDomain) {
      if (!xmlStr || xmlStr.indexOf("<video_source") === -1 || xmlStr.indexOf("<error") !== -1) {
        return null;
      }
      var titleMatch = xmlStr.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || xmlStr.match(/<title>([^<]+)<\/title>/i);
      var durationMatch = xmlStr.match(/<duration>(\d+)<\/duration>/i);
      var videoTitle = decodeHtmlEntities2(titleMatch ? titleMatch[1].trim() : "Videa Stream");
      var duration = durationMatch ? parseInt(durationMatch[1], 10) : 0;
      var uploadYear = extractUploadYearFromText(xmlStr) || extractUploadYearFromText(htmlStr);
      var headers = {
        Referer: baseDomain + "/",
        Origin: baseDomain,
        "User-Agent": UA
      };
      var sources = [];
      var sourceRegex = /<video_source\s+([^>]+)>([^<]+)<\/video_source>/g;
      var match;
      while ((match = sourceRegex.exec(xmlStr)) !== null) {
        var attrs = match[1];
        var url = normalizeHttpUrl2(match[2].trim(), baseDomain);
        if (!url) continue;
        var nameMatch = attrs.match(/name="([^"]+)"/);
        var heightMatch = attrs.match(/height="([^"]+)"/);
        var expMatch = attrs.match(/exp="([^"]+)"/);
        var name = nameMatch ? nameMatch[1] : "unknown";
        var height = heightMatch ? parseInt(heightMatch[1], 10) : inferHeight(name, 480);
        var exp = expMatch ? expMatch[1] : "";
        var hashMatch = xmlStr.match(new RegExp("<hash_value_" + name + ">([^<]+)</hash_value_" + name + ">"));
        if (hashMatch && exp) {
          url += (url.indexOf("?") !== -1 ? "&" : "?") + "md5=" + hashMatch[1] + "&expires=" + exp;
        }
        sources.push({
          name,
          height,
          quality: height + "p",
          url,
          videoTitle,
          duration,
          uploadYear,
          headers
        });
      }
      sources.sort(function(a, b) {
        return b.height - a.height;
      });
      return { videoTitle, duration, uploadYear, sources };
    }
    function fetchVideaXml(queryParam, baseDomain) {
      return __async(this, null, function* () {
        var playerUrl = baseDomain + "/player?" + queryParam;
        var playerRes = yield fetchText2(playerUrl, { headers: { Referer: baseDomain + "/" } }, 6500);
        if (!playerRes || !playerRes.ok || !playerRes.text) return null;
        var nonceMatch = playerRes.text.match(/_xt\s*=\s*"([^"]+)"/);
        if (!nonceMatch) return null;
        var params = computeVideaParams(nonceMatch[1]);
        var xmlUrl = baseDomain + "/player/xml?" + queryParam + "&_s=" + encodeURIComponent(params._s) + "&_t=" + encodeURIComponent(params._t);
        var xmlRes = yield fetchText2(xmlUrl, { headers: { Referer: playerUrl } }, 6500);
        if (!xmlRes || !xmlRes.text) return null;
        var raw = xmlRes.text;
        var xmlStr = "";
        if (raw.indexOf("<?xml") === 0 || raw.indexOf("<videa_video") !== -1 || raw.indexOf("<error") !== -1) {
          xmlStr = raw;
        } else {
          var xs = getHeader(xmlRes.headers, "x-videa-xs");
          var key = params.buildKey(xs);
          xmlStr = rc4DecryptBytesToUtf8(base64ToBytes(raw), key);
        }
        return { xmlStr, htmlStr: playerRes.text };
      });
    }
    function extractVideaInfo(vcodeOrUrl, forcedDomain) {
      return __async(this, null, function* () {
        try {
          var input = decodeHtmlEntities2(String(vcodeOrUrl || "").trim());
          if (!input) return null;
          if (input.indexOf("//") === 0) input = "https:" + input;
          var baseDomain = forcedDomain || (input.indexOf("videakid.hu") !== -1 ? "https://videakid.hu" : "https://videa.hu");
          var fParamMatch = input.match(/[?&]f=([a-zA-Z0-9._-]+)/);
          if (fParamMatch) {
            var fFetched = yield fetchVideaXml("f=" + encodeURIComponent(fParamMatch[1]) + "&s=%7B%22loc%22%3A1%7D", baseDomain);
            if (fFetched) {
              var fParsed = parseVideaXml(fFetched.xmlStr, fFetched.htmlStr, baseDomain);
              if (fParsed && fParsed.sources.length > 0) return fParsed;
            }
          }
          var vcode = input;
          if (/^https?:\/\//i.test(input)) {
            var vMatch = input.match(/[?&]v=([a-zA-Z0-9_-]+)/);
            var slugMatch = input.match(/[-/]([a-zA-Z0-9]{16})(?:[?&#]|$)/);
            if (vMatch) vcode = vMatch[1];
            else if (slugMatch) vcode = slugMatch[1];
          }
          if (vcode && vcode.indexOf("http") !== 0) {
            var fetched = yield fetchVideaXml("v=" + encodeURIComponent(vcode), baseDomain);
            if (fetched && fetched.xmlStr) {
              if (fetched.xmlStr.indexOf('panelstyle="noembed"') !== -1) {
                var pageUrlMatch = fetched.xmlStr.match(/<error[^>]*>(https?:\/\/[^<]+)<\/error>/);
                var pageTarget = pageUrlMatch && pageUrlMatch[1] || (/^https?:\/\//i.test(input) ? input : "");
                if (pageTarget) {
                  var pageRes = yield fetchText2(pageTarget, { headers: { Referer: baseDomain + "/" } }, 5500);
                  if (pageRes && pageRes.ok && pageRes.text) {
                    var pageFMatch = pageRes.text.match(/\/player\?f=([a-zA-Z0-9_.]+)/);
                    if (pageFMatch) {
                      var noembedFetched = yield fetchVideaXml("f=" + encodeURIComponent(pageFMatch[1]) + "&s=%7B%22loc%22%3A1%7D", baseDomain);
                      if (noembedFetched) {
                        var noembedParsed = parseVideaXml(noembedFetched.xmlStr, noembedFetched.htmlStr, baseDomain);
                        if (noembedParsed && noembedParsed.sources.length > 0) return noembedParsed;
                      }
                    }
                  }
                }
                return null;
              }
              var parsed = parseVideaXml(fetched.xmlStr, fetched.htmlStr, baseDomain);
              if (parsed && parsed.sources.length > 0) return parsed;
            }
          }
          if (/^https?:\/\//i.test(input)) {
            var fallbackRes = yield fetchText2(input, { headers: { Referer: baseDomain + "/" } }, 5500);
            if (fallbackRes && fallbackRes.ok && fallbackRes.text) {
              var fFallback = fallbackRes.text.match(/\/player\?f=([a-zA-Z0-9_.]+)/);
              if (fFallback) {
                var ff = yield fetchVideaXml("f=" + encodeURIComponent(fFallback[1]) + "&s=%7B%22loc%22%3A1%7D", baseDomain);
                if (ff) {
                  var fp = parseVideaXml(ff.xmlStr, ff.htmlStr, baseDomain);
                  if (fp && fp.sources.length > 0) return fp;
                }
              }
              var cMatch = fallbackRes.text.match(/[-/]([a-zA-Z0-9]{16})(?:["'?&#]|$)/);
              if (cMatch && cMatch[1] !== vcode) {
                var cf = yield fetchVideaXml("v=" + encodeURIComponent(cMatch[1]), baseDomain);
                if (cf) return parseVideaXml(cf.xmlStr, cf.htmlStr, baseDomain);
              }
            }
          }
        } catch (_) {
        }
        return null;
      });
    }
    function resolveVideaEmbed(iframeSrc, forcedDomain) {
      return __async(this, null, function* () {
        var info = yield extractVideaInfo(iframeSrc, forcedDomain);
        return info ? info.sources : [];
      });
    }
    function extractVideaStreams(vcodeOrUrl, providerLabel, customTitle, languageLabel) {
      return __async(this, null, function* () {
        var info = yield extractVideaInfo(vcodeOrUrl);
        if (!info || !info.sources.length) return [];
        var best = info.sources[0];
        var s = buildNuvioStream({
          url: best.url,
          provider: providerLabel || "Videa",
          hoster: "Videa",
          title: customTitle || info.videoTitle,
          quality: best.quality,
          height: best.height,
          language: languageLabel || "Magyar Szinkron",
          isHls: false,
          headers: best.headers
        });
        return s ? [s] : [];
      });
    }
    function extractIndavideoInfo(urlOrHash) {
      return __async(this, null, function* () {
        var input = String(urlOrHash || "").trim();
        if (!input) return null;
        try {
          var embHash = null;
          var pageHtml = "";
          var directHash = input.match(/embed\.indavideo\.hu\/player\/video\/([a-fA-F0-9]{8,16})/i);
          if (directHash) {
            embHash = directHash[1];
          } else if (/^[a-fA-F0-9]{10,12}$/.test(input)) {
            embHash = input;
          } else {
            var pageUrl = /^https?:\/\//i.test(input) ? normalizeHttpUrl2(input) : "https://indavideo.hu/video/" + input;
            var pageRes = yield fetchText2(pageUrl, { headers: { Referer: "https://indavideo.hu/" } }, 6e3);
            if (pageRes && pageRes.ok && pageRes.text) {
              pageHtml = pageRes.text;
              var hm = pageHtml.match(/id=['"]emb_hash['"][^>]+value=['"]([^'"]+)['"]/i) || pageHtml.match(/value=['"]([^'"]+)['"][^>]+id=['"]emb_hash['"]/i) || pageHtml.match(/embed\.indavideo\.hu\/player\/video\/([a-zA-Z0-9]+)/i);
              if (hm) embHash = hm[1];
            }
          }
          if (!embHash) return null;
          var rnd = Math.floor(Math.random() * 2147483647);
          var dataUrl = "https://amfphp.indavideo.hu/SYm0json.php/player.playerHandler.getVideoData/" + embHash + "/12/?callback=json&_=" + rnd;
          var res = yield fetchText2(dataUrl, { headers: { Referer: "https://embed.indavideo.hu/" } }, 6e3);
          if (!res || !res.ok || !res.text) return null;
          var txt = res.text.trim();
          if (txt.indexOf("json(") === 0) txt = txt.slice(5, txt.lastIndexOf(")"));
          var parsed = JSON.parse(txt);
          var data = parsed && parsed.data;
          if (!data) return null;
          var duration = data.length ? parseInt(data.length, 10) : data.duration ? parseInt(data.duration, 10) : 0;
          var uploadYear = extractUploadYearFromText(String(data.date || "")) || extractUploadYearFromText(txt) || extractUploadYearFromText(pageHtml);
          var videoTitle = decodeHtmlEntities2(data.title || "");
          var filesh = data.filesh || {};
          var videoFiles = [];
          if (Array.isArray(data.video_files)) {
            videoFiles = data.video_files.slice();
          } else if (data.video_files && typeof data.video_files === "object") {
            for (var fk in data.video_files) {
              if (Object.prototype.hasOwnProperty.call(data.video_files, fk)) {
                videoFiles.push(data.video_files[fk]);
              }
            }
          }
          if (data.video_file && videoFiles.indexOf(data.video_file) === -1) {
            videoFiles.push(data.video_file);
          }
          var headers = {
            Referer: "https://indavideo.hu/",
            Origin: "https://indavideo.hu",
            "User-Agent": UA
          };
          var seenHeights = {};
          var sources = [];
          var fallbackToken = "";
          for (var tk in filesh) {
            if (Object.prototype.hasOwnProperty.call(filesh, tk) && filesh[tk]) {
              fallbackToken = filesh[tk];
              break;
            }
          }
          for (var i = 0; i < videoFiles.length; i++) {
            var vUrl = videoFiles[i];
            if (!vUrl || typeof vUrl !== "string") continue;
            var hm = vUrl.match(/\.(\d{3,4})\.mp4/);
            var height = hm ? parseInt(hm[1], 10) : 360;
            if (seenHeights[height]) continue;
            seenHeights[height] = true;
            var token = filesh[String(height)] || filesh[height] || fallbackToken;
            var finalUrl = normalizeHttpUrl2(vUrl).replace("??", "?");
            if (token) {
              finalUrl += (finalUrl.indexOf("?") !== -1 ? "&" : "?") + "token=" + token;
            }
            sources.push({
              height,
              quality: height + "p",
              url: finalUrl,
              duration,
              uploadYear,
              videoTitle,
              headers
            });
          }
          sources.sort(function(a, b) {
            return b.height - a.height;
          });
          return {
            videoTitle,
            duration,
            uploadYear,
            sources,
            streams: sources
            // compatibility alias for callers expecting .streams
          };
        } catch (_) {
          return null;
        }
      });
    }
    function extractIndavideoStreams(urlOrHash, providerLabel, customTitle, languageLabel) {
      return __async(this, null, function* () {
        var info = yield extractIndavideoInfo(urlOrHash);
        if (!info || !info.sources.length) return [];
        var best = info.sources[0];
        var s = buildNuvioStream({
          url: best.url,
          provider: providerLabel || "Indavideo",
          hoster: "Indavideo",
          title: customTitle || info.videoTitle,
          quality: best.quality,
          height: best.height,
          language: languageLabel || "Magyar Szinkron",
          isHls: false,
          headers: best.headers
        });
        return s ? [s] : [];
      });
    }
    var OKRU_QUALITY_MAP = {
      ultra: 2160,
      quad: 1440,
      full: 1080,
      high: 720,
      hd: 720,
      medium: 480,
      sd: 480,
      low: 360,
      lowest: 240,
      mobile: 144
    };
    function resolveOkTrackHeight(line, trackPath) {
      var qualMatch = line.match(/QUALITY=["']?([a-z0-9]+)["']?/i);
      var qKey = qualMatch && qualMatch[1] ? qualMatch[1].toLowerCase() : "";
      if (OKRU_QUALITY_MAP[qKey]) return OKRU_QUALITY_MAP[qKey];
      var path = String(trackPath || "");
      if (/\/type\/5\//.test(path)) return 1080;
      if (/\/type\/3\//.test(path)) return 720;
      if (/\/type\/2\//.test(path)) return 480;
      if (/\/type\/1\//.test(path)) return 360;
      if (/\/type\/0\//.test(path)) return 240;
      if (/\/type\/4\//.test(path)) return 144;
      var resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
      if (resMatch) {
        var w = parseInt(resMatch[1], 10);
        var h = parseInt(resMatch[2], 10);
        if (w >= 1800 || h >= 800) return 1080;
        if (w >= 1200 || h >= 500) return 720;
        if (w >= 800 || h >= 350) return 480;
        if (w >= 600 || h >= 240) return 360;
        return h;
      }
      return 720;
    }
    function parseOkMasterTracks(masterUrl, reqHeaders, appendIndexM3u8) {
      return __async(this, null, function* () {
        var tracks = [];
        if (!masterUrl) return tracks;
        var res = yield fetchText2(masterUrl, { headers: reqHeaders }, 5e3);
        if (!res || !res.ok || !res.text) return tracks;
        var lines = res.text.split("\n").map(function(l) {
          return l.trim();
        }).filter(Boolean);
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].indexOf("#EXT-X-STREAM-INF") === 0) {
            var nextLine = lines[i + 1];
            if (nextLine && nextLine.charAt(0) !== "#") {
              var height = resolveOkTrackHeight(lines[i], nextLine);
              if (height >= 360) {
                var trackUrl = normalizeHttpUrl2(nextLine, masterUrl);
                if (appendIndexM3u8 && !/\.m3u8(\?|$)/i.test(trackUrl)) {
                  trackUrl = trackUrl.replace(/\/?$/, "/") + "index.m3u8";
                }
                tracks.push({ height, url: trackUrl });
              }
            }
          }
        }
        return tracks;
      });
    }
    function extractOkRuStreams(embedUrl, providerLabel, customTitleOrMeta, mediaMeta, languageLabel) {
      return __async(this, null, function* () {
        var customTitle = typeof customTitleOrMeta === "string" ? customTitleOrMeta : "";
        var meta = typeof customTitleOrMeta === "object" ? customTitleOrMeta : mediaMeta || null;
        var streams = [];
        try {
          var url = normalizeHttpUrl2(embedUrl, "https://ok.ru/");
          var reqHeaders = { Referer: "https://ok.ru/", Origin: "https://ok.ru", "User-Agent": UA };
          var res = yield fetchText2(url, { headers: { Referer: "https://ok.ru/" } }, 6e3);
          if (!res || !res.ok || !res.text) return streams;
          var optsMatch = res.text.match(/data-options="([^"]+)"/i);
          if (!optsMatch) return streams;
          var opts = JSON.parse(decodeHtmlEntities2(optsMatch[1]));
          var okMeta = opts && opts.flashvars && opts.flashvars.metadata ? JSON.parse(opts.flashvars.metadata) : null;
          if (!okMeta) return streams;
          var durSec = okMeta.movie && okMeta.movie.duration ? parseInt(okMeta.movie.duration, 10) : 0;
          if (meta && durSec > 0 && !isValidRuntime(durSec, meta)) {
            return [];
          }
          var titleText = customTitle || okMeta.movie && okMeta.movie.title || "";
          var seenHeights = {};
          var hlsSources = [
            { url: okMeta.ondemandHls, appendIndex: false },
            { url: okMeta.hlsManifestUrl, appendIndex: true }
          ];
          for (var s = 0; s < hlsSources.length; s++) {
            if (!hlsSources[s].url) continue;
            var tracks = yield parseOkMasterTracks(hlsSources[s].url, reqHeaders, hlsSources[s].appendIndex);
            for (var t = 0; t < tracks.length; t++) {
              var tr = tracks[t];
              if (seenHeights[tr.height]) continue;
              seenHeights[tr.height] = true;
              var st = buildNuvioStream({
                url: tr.url,
                provider: providerLabel || "OK.ru",
                hoster: "OK.ru",
                title: titleText,
                quality: tr.height + "p",
                height: tr.height,
                language: languageLabel,
                isHls: true,
                headers: reqHeaders
              });
              if (st) streams.push(st);
            }
          }
          if (Array.isArray(okMeta.videos)) {
            for (var i = 0; i < okMeta.videos.length; i++) {
              var v = okMeta.videos[i];
              if (!v || !v.url || v.disallowed) continue;
              var h = OKRU_QUALITY_MAP[v.name] || 480;
              if (h < 360 || seenHeights[h]) continue;
              seenHeights[h] = true;
              var mp4St = buildNuvioStream({
                url: v.url,
                provider: providerLabel || "OK.ru",
                hoster: "OK.ru",
                title: titleText,
                quality: h + "p",
                height: h,
                language: languageLabel,
                isHls: false,
                headers: reqHeaders
              });
              if (mp4St) streams.push(mp4St);
            }
          }
        } catch (_) {
        }
        if (streams.length <= 1) return streams;
        sortStreamsInPlace(streams);
        return [streams[0]];
      });
    }
    function extractVidmoly(embedUrl, providerLabel, customTitle, languageLabel) {
      return __async(this, null, function* () {
        var streams = [];
        try {
          var url = normalizeHttpUrl2(embedUrl);
          var wMatch = url.match(/\/w\/([a-zA-Z0-9]+)/);
          if (wMatch) {
            url = "https://vidmoly.biz/embed-" + wMatch[1] + ".html";
          } else if (url.indexOf("/embed-") !== -1) {
            url = url.replace(/https?:\/\/[^/]+/, "https://vidmoly.biz");
          }
          var res = yield fetchText2(url, { headers: { Referer: "https://vidmoly.biz/" } }, 6500);
          if (!res || !res.ok || !res.text) return streams;
          var m3u8 = res.text.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
          if (m3u8) {
            var origin = getOrigin(res.url || url) || "https://vidmoly.biz";
            var st = buildNuvioStream({
              url: m3u8[1],
              provider: providerLabel || "Vidmoly",
              hoster: "Vidmoly",
              title: customTitle,
              quality: "1080p",
              height: 1080,
              language: languageLabel,
              isHls: true,
              headers: { Referer: origin + "/", Origin: origin, "User-Agent": UA }
            });
            if (st) streams.push(st);
          }
        } catch (_) {
        }
        return streams;
      });
    }
    function extractVoe(embedUrl, providerLabel, customTitle, languageLabel) {
      return __async(this, null, function* () {
        var streams = [];
        try {
          var currentUrl = normalizeHttpUrl2(embedUrl);
          var slugMatch = currentUrl.match(/(?:voe\.[a-z]+|susanexpectcare\.com)\/(?:e\/|d\/)?([a-zA-Z0-9]+)/i);
          var slug = slugMatch ? slugMatch[1] : null;
          if (slug && currentUrl.indexOf("voe.") !== -1 && currentUrl.indexOf("/e/") === -1) {
            currentUrl = "https://voe.sx/e/" + slug;
          }
          var html = "";
          for (var hop = 0; hop < 3; hop++) {
            var res = yield fetchText2(currentUrl, { headers: { Referer: "https://voe.sx/" } }, 6e3);
            if (!res || !res.ok || !res.text) break;
            html = res.text;
            currentUrl = res.url || currentUrl;
            var redirectMatch = html.match(/window\.location\.href\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
            if (redirectMatch && html.indexOf('<script type="application/json">') === -1) {
              currentUrl = redirectMatch[1];
              continue;
            }
            break;
          }
          if ((!html || /ddos-guard/i.test(html) || html.length < 2e3) && slug) {
            var mirrorUrl = "https://susanexpectcare.com/" + slug;
            var mirrorRes = yield fetchText2(mirrorUrl, { headers: { Referer: "https://voe.sx/" } }, 6e3);
            if (mirrorRes && mirrorRes.ok && mirrorRes.text && (mirrorRes.text.indexOf('<script type="application/json">') !== -1 || mirrorRes.text.indexOf("hls") !== -1)) {
              currentUrl = mirrorRes.url || mirrorUrl;
              html = mirrorRes.text;
            }
          }
          if (!html) return streams;
          var origin = getOrigin(currentUrl) || "https://voe.sx";
          var headers = { Referer: origin + "/", Origin: origin, "User-Agent": UA };
          var jsonScriptMatch = html.match(/<script[^>]*type=["']application\/json["'][^>]*>\s*\["([^"]+)"\]\s*<\/script>/i);
          if (jsonScriptMatch) {
            var data = decodeVoePayload(jsonScriptMatch[1]);
            if (data) {
              var hlsUrl = data.source || data.file;
              if (hlsUrl && /^https?:\/\//i.test(hlsUrl)) {
                var s1 = buildNuvioStream({
                  url: hlsUrl,
                  provider: providerLabel || "VOE",
                  hoster: "VOE",
                  title: customTitle,
                  quality: "1080p",
                  height: 1080,
                  language: languageLabel,
                  isHls: true,
                  headers
                });
                if (s1) streams.push(s1);
              } else if (data.direct_access_url && /^https?:\/\//i.test(data.direct_access_url)) {
                var s2 = buildNuvioStream({
                  url: data.direct_access_url,
                  provider: providerLabel || "VOE",
                  hoster: "VOE",
                  title: customTitle,
                  quality: "720p",
                  height: 720,
                  language: languageLabel,
                  isHls: false,
                  headers
                });
                if (s2) streams.push(s2);
              }
            }
          }
          if (streams.length === 0) {
            var hlsMatch = html.match(/['"]hls['"]\s*:\s*['"]([^'"]+)['"]/i);
            if (hlsMatch && hlsMatch[1]) {
              var u = hlsMatch[1];
              if (u.indexOf("http") !== 0) {
                try {
                  u = bytesToUtf8(base64ToBytes(u));
                } catch (_) {
                }
              }
              if (/^https?:\/\//i.test(u)) {
                var sf = buildNuvioStream({
                  url: u,
                  provider: providerLabel || "VOE",
                  hoster: "VOE",
                  title: customTitle,
                  quality: "1080p",
                  height: 1080,
                  language: languageLabel,
                  isHls: true,
                  headers
                });
                if (sf) streams.push(sf);
              }
            }
          }
        } catch (_) {
        }
        return streams;
      });
    }
    function extractRpmStream(rpmUrlOrId, referer, providerLabel, customTitle, languageLabel) {
      return __async(this, null, function* () {
        var videoId = String(rpmUrlOrId || "").trim();
        var hashMatch = videoId.match(/#([a-zA-Z0-9]+)/);
        if (hashMatch) {
          videoId = hashMatch[1];
        } else if (/^https?:\/\//i.test(videoId)) {
          var idMatch = videoId.match(/\/([a-zA-Z0-9]{5,24})$/);
          if (idMatch) videoId = idMatch[1];
        }
        if (!videoId || videoId.length < 4) return [];
        var refHost = "hdmozi.hu";
        var parsedRef = safeParseUrl(referer);
        if (parsedRef && parsedRef.hostname) refHost = parsedRef.hostname;
        var hosts = [
          "https://rpmshare.rpmstream.live",
          "https://rpmvid.com",
          "https://rpmhub.site"
        ];
        for (var i = 0; i < hosts.length; i++) {
          var host = hosts[i];
          try {
            var apiUrl = host + "/api/v1/video?id=" + encodeURIComponent(videoId) + "&w=1920&h=1080&r=" + encodeURIComponent(refHost);
            var res = yield fetchText2(apiUrl, { headers: { Referer: host + "/#" + videoId, Origin: host } }, 6e3);
            if (!res || !res.ok || !res.text) continue;
            var data = decryptRpmHex(res.text);
            if (!data) continue;
            var masterUrl = data.hls || data.source || data.file;
            if (!masterUrl || !/^https?:\/\//i.test(masterUrl)) continue;
            var headers = { Referer: host + "/", Origin: host, "User-Agent": UA };
            var streamTitle = customTitle || data.title || "";
            var variants = [];
            var masterRes = yield fetchText2(masterUrl, { headers: { Referer: host + "/", Origin: host } }, 4500);
            if (masterRes && masterRes.ok && masterRes.text) {
              var mu = safeParseUrl(masterUrl);
              var vParam = mu && mu.searchParams ? mu.searchParams.get("v") : null;
              var lines = masterRes.text.split(/\r?\n/);
              var lastInf = null;
              for (var l = 0; l < lines.length; l++) {
                var line = lines[l].trim();
                if (!line) continue;
                if (line.indexOf("#EXT-X-STREAM-INF") === 0) {
                  lastInf = line;
                } else if (line.charAt(0) !== "#" && lastInf) {
                  var vUrl = safeParseUrl(line, masterUrl);
                  if (vUrl) {
                    if (vParam && vUrl.searchParams && !vUrl.searchParams.has("v")) {
                      vUrl.searchParams.set("v", vParam);
                    }
                    var resM = lastInf.match(/RESOLUTION=(\d+)x(\d+)/i);
                    var h = resM ? parseInt(resM[2], 10) : 720;
                    var q = h >= 2160 ? "2160p" : h >= 1440 ? "1440p" : h >= 1080 ? "1080p" : h >= 720 ? "720p" : h >= 480 ? "480p" : h + "p";
                    variants.push({ url: vUrl.href, quality: q, height: h });
                  }
                  lastInf = null;
                }
              }
            }
            var out = [];
            if (variants.length > 0) {
              variants.sort(function(a, b) {
                return b.height - a.height;
              });
              var bestVar = variants[0];
              var st = buildNuvioStream({
                url: bestVar.url,
                provider: providerLabel || "RPM",
                hoster: "RPM",
                title: streamTitle,
                quality: bestVar.quality,
                height: bestVar.height,
                language: languageLabel,
                isHls: true,
                headers
              });
              if (st) out.push(st);
            } else {
              var fallbackSt = buildNuvioStream({
                url: masterUrl,
                provider: providerLabel || "RPM",
                hoster: "RPM",
                title: streamTitle,
                quality: "1080p",
                height: 1080,
                language: languageLabel,
                isHls: true,
                headers
              });
              if (fallbackSt) out.push(fallbackSt);
            }
            if (out.length > 0) return out;
          } catch (_) {
          }
        }
        return [];
      });
    }
    function extractPackerHoster(embedUrl, providerLabel, customTitle, hostName, languageLabel) {
      return __async(this, null, function* () {
        var streams = [];
        try {
          var url = normalizeHttpUrl2(embedUrl);
          var res = yield fetchText2(url, { headers: { Referer: url } }, 6e3);
          if (!res || !res.ok || !res.text) return streams;
          var unpackedList = generalUnpack(res.text);
          var singleUnpacked = unpackPacker(res.text);
          if (singleUnpacked) unpackedList.push(singleUnpacked);
          var haystack = unpackedList.join("\n") + "\n" + res.text;
          var origin = getOrigin(res.url || url) || getOrigin(url);
          var headers = origin ? { Referer: origin + "/", Origin: origin, "User-Agent": UA } : { "User-Agent": UA };
          var seen = {};
          var reM3u8 = /(https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*)/gi;
          var m;
          while ((m = reM3u8.exec(haystack)) !== null) {
            var u = m[1].replace(/\\+/g, "");
            if (seen[u]) continue;
            seen[u] = true;
            var st = buildNuvioStream({
              url: u,
              provider: providerLabel || hostName,
              hoster: hostName,
              title: customTitle,
              quality: "1080p",
              height: 1080,
              language: languageLabel,
              isHls: true,
              headers
            });
            if (st) streams.push(st);
          }
          if (streams.length === 0) {
            var reMp4 = /(https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*)/gi;
            var mm;
            while ((mm = reMp4.exec(haystack)) !== null) {
              var mu = mm[1].replace(/\\+/g, "");
              if (seen[mu] || mu.indexOf("Big_Buck_Bunny") !== -1) continue;
              seen[mu] = true;
              var ms = buildNuvioStream({
                url: mu,
                provider: providerLabel || hostName,
                hoster: hostName,
                title: customTitle,
                quality: "720p",
                height: 720,
                language: languageLabel,
                isHls: false,
                headers
              });
              if (ms) streams.push(ms);
            }
          }
        } catch (_) {
        }
        return streams;
      });
    }
    function extractStreamRuby(url, providerLabel, customTitle, languageLabel) {
      return __async(this, null, function* () {
        try {
          var startUrl = normalizeHttpUrl2(url);
          var res = yield fetchText2(startUrl, { headers: { Referer: "https://mindjart.megnezed.com/" } }, 6500);
          var html = res && res.text || "";
          var refUrl = res && res.url || startUrl;
          var m3u8 = html.match(/https?:\/\/[^\s"'`<>]+\.m3u8[^\s"'`<>]*/i);
          if (!m3u8) {
            var u = safeParseUrl(refUrl);
            var code = u ? u.pathname.replace(/^\/+/, "").replace(/\.html$/i, "").replace(/^embed-/, "") : "";
            if (code && u) {
              var embedUrl = u.origin + "/embed-" + code + ".html";
              var er = yield fetchText2(embedUrl, { headers: { Referer: refUrl } }, 6e3);
              if (er && er.text) {
                html = er.text;
                refUrl = er.url || embedUrl;
                m3u8 = html.match(/https?:\/\/[^\s"'`<>]+\.m3u8[^\s"'`<>]*/i);
              }
            }
          }
          if (!m3u8) return [];
          var origin = getOrigin(refUrl);
          var pageTitle = (html.match(/<title>([^<]+)<\/title>/i) || [])[1] || "";
          var st = buildNuvioStream({
            url: m3u8[0],
            provider: providerLabel || "StreamRuby",
            hoster: "StreamRuby",
            title: customTitle,
            height: inferHeight(pageTitle, 720),
            language: languageLabel,
            isHls: true,
            headers: { Referer: origin + "/", Origin: origin, "User-Agent": UA }
          });
          return st ? [st] : [];
        } catch (_) {
          return [];
        }
      });
    }
    function extractVtube(url, providerLabel, customTitle, languageLabel) {
      return __async(this, null, function* () {
        try {
          var startUrl = normalizeHttpUrl2(url);
          var res = yield fetchText2(startUrl, { headers: { Referer: "https://mindjart.megnezed.com/" } }, 6500);
          if (!res || !res.text) return [];
          var m3u8 = res.text.match(/https?:\/\/[^\s"'`<>]+\.m3u8[^\s"'`<>]*/i);
          if (!m3u8) return [];
          var origin = getOrigin(res.url || startUrl);
          var pageTitle = (res.text.match(/<title>([^<]+)<\/title>/i) || [])[1] || "";
          var st = buildNuvioStream({
            url: m3u8[0],
            provider: providerLabel || "vTube",
            hoster: "vTube",
            title: customTitle,
            height: inferHeight(pageTitle, 720),
            language: languageLabel,
            isHls: true,
            headers: { Referer: origin + "/", Origin: origin, "User-Agent": UA }
          });
          return st ? [st] : [];
        } catch (_) {
          return [];
        }
      });
    }
    function extractLuluvid(url, providerLabel, customTitle, languageLabel) {
      return __async(this, null, function* () {
        try {
          var u = safeParseUrl(url);
          if (!u) return [];
          var parts = u.pathname.split("/").filter(Boolean);
          var code = (parts[parts.length - 1] || "").replace(/\.html$/i, "");
          if (!code) return [];
          var embedUrl = u.origin + "/e/" + code;
          var res = yield fetchText2(embedUrl, { headers: { Referer: u.origin + "/" } }, 6500);
          if (!res || !res.text) return [];
          var haystack = generalUnpack(res.text).join("\n") + "\n" + res.text;
          var m3u8 = haystack.match(/https?:\/\/[^\s"'`<>]+\.m3u8[^\s"'`<>]*/i);
          if (!m3u8) return [];
          var pageTitle = (res.text.match(/<title>([^<]+)<\/title>/i) || [])[1] || "";
          var st = buildNuvioStream({
            url: m3u8[0],
            provider: providerLabel || "LuluVid",
            hoster: "LuluVid",
            title: customTitle,
            height: inferHeight(pageTitle, 720),
            language: languageLabel,
            isHls: true,
            headers: { Referer: u.origin + "/", Origin: u.origin, "User-Agent": UA }
          });
          return st ? [st] : [];
        } catch (_) {
          return [];
        }
      });
    }
    function extractMixdrop(url, providerLabel, customTitle, languageLabel) {
      return __async(this, null, function* () {
        try {
          var u = safeParseUrl(url);
          if (!u) return [];
          var parts = u.pathname.split("/").filter(Boolean);
          var code = parts[1] || parts[0];
          if (!code) return [];
          var embedUrl = u.origin + "/e/" + code;
          var res = yield fetchText2(embedUrl, { headers: { Referer: u.origin + "/" } }, 6500);
          if (!res || !res.text) return [];
          var unpacked = generalUnpack(res.text).join("\n");
          var mp4Match = unpacked.match(/(?:MDCore\.)?wurl\s*=\s*["']([^"']+)["']/i);
          if (!mp4Match || mp4Match[1].trim().length < 5) return [];
          var mp4 = normalizeHttpUrl2(mp4Match[1]);
          var pageTitle = (res.text.match(/<title>([^<]+)<\/title>/i) || [])[1] || "";
          var st = buildNuvioStream({
            url: mp4,
            provider: providerLabel || "MixDrop",
            hoster: "MixDrop",
            title: customTitle,
            height: inferHeight(pageTitle, 720),
            language: languageLabel,
            isHls: false,
            headers: { Referer: u.origin + "/", Origin: u.origin, "User-Agent": UA }
          });
          return st ? [st] : [];
        } catch (_) {
          return [];
        }
      });
    }
    function extractVidara(url, providerLabel, customTitle, languageLabel) {
      return __async(this, null, function* () {
        try {
          var u = safeParseUrl(url);
          if (!u) return [];
          var m = u.pathname.match(/\/(?:v|e)\/([a-zA-Z0-9]+)/);
          var parts = u.pathname.split("/").filter(Boolean);
          var code = m && m[1] || parts[parts.length - 1];
          if (!code) return [];
          var data = yield fetchJson(u.origin + "/api/stream", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Referer: url,
              Origin: u.origin
            },
            body: JSON.stringify({ filecode: code })
          }, 6e3);
          if (!data || !data.streaming_url || !/^https?:\/\//i.test(data.streaming_url)) return [];
          var st = buildNuvioStream({
            url: data.streaming_url,
            provider: providerLabel || "Vidara",
            hoster: "Vidara",
            title: customTitle || data.title || "",
            height: inferHeight(data.title || "", 720),
            language: languageLabel,
            isHls: true,
            headers: { Referer: u.origin + "/", Origin: u.origin, "User-Agent": UA }
          });
          return st ? [st] : [];
        } catch (_) {
          return [];
        }
      });
    }
    function extractByse(url, providerLabel, customTitle, languageLabel) {
      return __async(this, null, function* () {
        try {
          var u = safeParseUrl(url);
          if (!u) return [];
          var m = u.pathname.match(/\/(?:d|e|v|f)\/([a-zA-Z0-9]+)/);
          var code = m && m[1];
          if (code) {
            var data = yield fetchJson(u.origin + "/api/videos/" + code, {
              headers: { Referer: u.origin + "/e/" + code }
            }, 6500);
            if (data && data.playback) {
              var decrypted = yield decryptBysePlayback(data.playback);
              if (decrypted && Array.isArray(decrypted.sources)) {
                var valid = decrypted.sources.filter(function(s) {
                  return s && typeof s.url === "string" && /^https?:\/\//i.test(s.url);
                });
                valid.sort(function(a, b) {
                  return (b.height || 0) - (a.height || 0);
                });
                if (valid.length > 0) {
                  var item = valid[0];
                  var h = Number(item.height) || inferHeight(item.label || data.title || "", 720);
                  var isHls = item.url.indexOf(".m3u8") !== -1 || (item.mime_type || "").indexOf("mpegurl") !== -1;
                  var st = buildNuvioStream({
                    url: item.url,
                    provider: providerLabel || "Filemoon",
                    hoster: "Filemoon",
                    title: customTitle || data.title || "",
                    height: h,
                    language: languageLabel,
                    isHls,
                    headers: { Referer: u.origin + "/", Origin: u.origin, "User-Agent": UA }
                  });
                  if (st) return [st];
                }
              }
            }
          }
          return yield extractPackerHoster(url, providerLabel, customTitle, "Filemoon", languageLabel);
        } catch (_) {
          return [];
        }
      });
    }
    function resolveAnyEmbed2(rawUrl, providerLabel, customTitle, meta, languageLabel) {
      return __async(this, null, function* () {
        var url = normalizeHttpUrl2(rawUrl);
        if (!url || !/^https?:\/\//i.test(url) || isDownloadOnlyHost2(url)) return [];
        var lower = url.toLowerCase();
        if (lower.indexOf("videa.hu") !== -1 || lower.indexOf("videakid.hu") !== -1) {
          return yield extractVideaStreams(url, providerLabel, customTitle, languageLabel);
        }
        if (lower.indexOf("indavideo.hu") !== -1) {
          return yield extractIndavideoStreams(url, providerLabel, customTitle, languageLabel);
        }
        if (/rpmstream|rpmvid|rpmhub|rpmshare/.test(lower)) {
          return yield extractRpmStream(url, "https://hdmozi.hu/", providerLabel, customTitle, languageLabel);
        }
        if (/voe\.|voe-|shanelocaldog|walterprettytheir|yodelswart|launchreliant|diananatureforeign|susanexpectcare|jilliandeborah|reputationsicklyheavily|tupacpreston|cloudwindow|ugc-cdn|eunice|generousdiscipline|audaciouscarpenter/.test(lower)) {
          var voeStreams = yield extractVoe(url, providerLabel, customTitle, languageLabel);
          if (voeStreams.length > 0) return voeStreams;
        }
        if (lower.indexOf("ok.ru") !== -1 || lower.indexOf("odnoklassniki.ru") !== -1) {
          return yield extractOkRuStreams(url, providerLabel, customTitle, meta, languageLabel);
        }
        if (lower.indexOf("vidmoly") !== -1) {
          var vmStreams = yield extractVidmoly(url, providerLabel, customTitle, languageLabel);
          if (vmStreams.length > 0) return vmStreams;
        }
        if (/rubystm\.|streamruby\.|nuvorel\.|rubyvid\./.test(lower)) {
          return yield extractStreamRuby(url, providerLabel, customTitle, languageLabel);
        }
        if (lower.indexOf("vtbe.to") !== -1) {
          return yield extractVtube(url, providerLabel, customTitle, languageLabel);
        }
        if (/luluvid\.|luluvdo\.|lulustream\./.test(lower)) {
          return yield extractLuluvid(url, providerLabel, customTitle, languageLabel);
        }
        if (/mxdrop\.|mixdrop\./.test(lower)) {
          return yield extractMixdrop(url, providerLabel, customTitle, languageLabel);
        }
        if (lower.indexOf("vidara") !== -1) {
          return yield extractVidara(url, providerLabel, customTitle, languageLabel);
        }
        if (/bysesayeveum\.|byselapuix\.|bysetayico\.|byse\.|filemoon\./.test(lower)) {
          return yield extractByse(url, providerLabel, customTitle, languageLabel);
        }
        if (/kerapoxy|streamwish|wishembed|vidoza|speedfiles|goodstream|supervideo/.test(lower)) {
          var u = safeParseUrl(url);
          var domain = u ? u.hostname.replace(/^www\./, "") : "Hoster";
          return yield extractPackerHoster(url, providerLabel, customTitle, domain, languageLabel);
        }
        if (/\.m3u8(\?|$)/i.test(lower)) {
          var mOrigin = getOrigin(url);
          var ms = buildNuvioStream({
            url,
            provider: providerLabel || "Direct",
            hoster: "HLS",
            title: customTitle,
            quality: "1080p",
            height: 1080,
            language: languageLabel,
            isHls: true,
            headers: mOrigin ? { Referer: mOrigin + "/", Origin: mOrigin, "User-Agent": UA } : void 0
          });
          return ms ? [ms] : [];
        }
        if (/\.mp4(\?|$)/i.test(lower)) {
          var mpOrigin = getOrigin(url);
          var mps = buildNuvioStream({
            url,
            provider: providerLabel || "Direct",
            hoster: "MP4",
            title: customTitle,
            quality: "720p",
            height: 720,
            language: languageLabel,
            isHls: false,
            headers: mpOrigin ? { Referer: mpOrigin + "/", Origin: mpOrigin, "User-Agent": UA } : void 0
          });
          return mps ? [mps] : [];
        }
        if (/^https?:\/\/[^/]+\/(?:[a-zA-Z0-9]{8,20}|e\/[a-zA-Z0-9]+|d\/[a-zA-Z0-9]+)\/?$/.test(url)) {
          var fallbackVoe = yield extractVoe(url, providerLabel, customTitle, languageLabel);
          if (fallbackVoe.length > 0) return fallbackVoe;
        }
        return [];
      });
    }
    module2.exports = {
      DOWNLOAD_ONLY_HOSTS,
      isDownloadOnlyHost: isDownloadOnlyHost2,
      inferHeight,
      buildNuvioStream,
      finalizeStreams: finalizeStreams2,
      extractVideaInfo,
      resolveVideaEmbed,
      extractVideaStreams,
      extractIndavideoInfo,
      extractIndavideoStreams,
      extractOkRuStreams,
      extractVidmoly,
      extractVoe,
      extractRpmStream,
      extractPackerHoster,
      extractStreamRuby,
      extractVtube,
      extractLuluvid,
      extractMixdrop,
      extractVidara,
      extractByse,
      resolveAnyEmbed: resolveAnyEmbed2
    };
  }
});

// src/sorozatok_net/index.js
var { normalizeHttpUrl, decodeHtmlEntities } = require_bytes();
var { createBudget, fetchText, resolveRedirectUrl } = require_http();
var { decodeHunter } = require_crypto_decoders();
var { resolveMediaMeta, normalizeTitle, escapeRegExp } = require_meta();
var { finalizeStreams, resolveAnyEmbed, isDownloadOnlyHost } = require_hosters();
var BASE_URL = "https://sorozatok.net";
var searchIndexCache = null;
var searchIndexTime = 0;
var seriesPageCache = {};
function getSorozatokIndex() {
  return __async(this, null, function* () {
    if (searchIndexCache && Date.now() - searchIndexTime < 6 * 3600 * 1e3) {
      return searchIndexCache;
    }
    var res = yield fetchText(BASE_URL + "/api/search.json", { headers: { Referer: BASE_URL + "/" } }, 7e3);
    if (res && res.ok && res.text) {
      try {
        var parsed = JSON.parse(res.text);
        if (Array.isArray(parsed) && parsed.length > 100) {
          searchIndexCache = parsed;
          searchIndexTime = Date.now();
          return parsed;
        }
      } catch (_) {
      }
    }
    return searchIndexCache || [];
  });
}
function getSeriesHtml(seriesUrl) {
  return __async(this, null, function* () {
    var cached = seriesPageCache[seriesUrl];
    if (cached && Date.now() - cached.ts < 15 * 60 * 1e3) {
      return cached.html;
    }
    var res = yield fetchText(seriesUrl, { headers: { Referer: BASE_URL + "/" } }, 6e3);
    if (res && res.ok && res.text) {
      var keys = Object.keys(seriesPageCache);
      if (keys.length >= 40) {
        delete seriesPageCache[keys[0]];
      }
      seriesPageCache[seriesUrl] = { ts: Date.now(), html: res.text };
      return res.text;
    }
    return null;
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      var budget = createBudget(45e3);
      var meta = yield resolveMediaMeta(tmdbId, mediaType, season, episode);
      if (!meta) return [];
      if (meta.type !== "series" || !meta.season || !meta.episode) return [];
      var titles = [];
      if (meta.hungarianTitle) titles.push(meta.hungarianTitle);
      if (meta.englishTitle && titles.indexOf(meta.englishTitle) === -1) titles.push(meta.englishTitle);
      if (titles.length === 0) return [];
      var index = yield getSorozatokIndex();
      var normTargets = titles.map(normalizeTitle).filter(Boolean);
      var matchedSeries = null;
      for (var i = 0; i < index.length; i++) {
        var item = index[i];
        var huNorm = normalizeTitle(item.cat_name);
        var enNorm = normalizeTitle(item.cat_eng);
        if (normTargets.indexOf(huNorm) !== -1 || normTargets.indexOf(enNorm) !== -1) {
          matchedSeries = item;
          break;
        }
      }
      var targetYear = meta.year ? parseInt(meta.year, 10) : null;
      if (!matchedSeries) {
        for (var j = 0; j < index.length; j++) {
          var it = index[j];
          var itemYear = it.year ? parseInt(it.year, 10) : null;
          if (targetYear && itemYear && Math.abs(targetYear - itemYear) > 2) continue;
          var itHu = normalizeTitle(it.cat_name);
          var itEn = normalizeTitle(it.cat_eng);
          var hit = normTargets.some(function(t) {
            if (t.length <= 3) return false;
            var re = new RegExp("(?:^|\\s)" + escapeRegExp(t) + "(?:\\s|$)", "i");
            return re.test(itHu) || re.test(itEn);
          });
          if (hit) {
            matchedSeries = it;
            break;
          }
        }
      }
      var slug = matchedSeries && matchedSeries.url ? matchedSeries.url : normalizeTitle(meta.hungarianTitle || meta.englishTitle).replace(/\s+/g, "-");
      if (!slug || budget.expired(5e3)) return [];
      var seriesUrl = BASE_URL + "/" + slug + "-online";
      var seriesHtml = yield getSeriesHtml(seriesUrl);
      if (!seriesHtml || budget.expired(4e3)) return [];
      var targetEpHref = null;
      var targetEmbedId = null;
      var targetEpTitle = "";
      var clipRe = /<a[^>]+class="clip-link"[^>]*>[\s\S]*?<h4[^>]+class="video-title"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/gi;
      var m;
      while ((m = clipRe.exec(seriesHtml)) !== null) {
        var fullTag = m[0];
        var hrefMatch = fullTag.match(/href="([^"]+)"/i);
        if (!hrefMatch) continue;
        var epTitle = decodeHtmlEntities(m[1].trim());
        var nums = [];
        var numRe = /\d+/g;
        var nm;
        while ((nm = numRe.exec(epTitle)) !== null) {
          nums.push(parseInt(nm[0], 10));
        }
        if (nums.length >= 2) {
          var sNum = nums[nums.length - 2];
          var eNum = nums[nums.length - 1];
          if (sNum === Number(meta.season) && eNum === Number(meta.episode)) {
            targetEpHref = hrefMatch[1];
            var idMatch = fullTag.match(/data-id="(\d+)"/i);
            targetEmbedId = idMatch ? idMatch[1] : null;
            targetEpTitle = epTitle;
            break;
          }
        }
      }
      if (!targetEpHref) return [];
      var epUrl = normalizeHttpUrl(targetEpHref, BASE_URL);
      var urlIdMatch = epUrl.match(/watch.*v=([a-zA-Z0-9_-]+)/);
      var urlId = urlIdMatch ? urlIdMatch[1] : null;
      if (!urlId) return [];
      if (!targetEmbedId) {
        var epPage = yield fetchText(epUrl, { headers: { Referer: seriesUrl } }, 6e3);
        if (!epPage || !epPage.ok || !epPage.text) return [];
        var embedIdMatch = epPage.text.match(new RegExp('data-id="([^"]+)"[^>]*' + escapeRegExp(urlId))) || epPage.text.match(/data-id="(\d+)"/i);
        if (!embedIdMatch) return [];
        targetEmbedId = embedIdMatch[1];
      }
      var goUrl = BASE_URL + "/go.php?id=" + encodeURIComponent(targetEmbedId) + "&key=" + encodeURIComponent(urlId);
      var sbPage = yield fetchText(goUrl, { headers: { Referer: epUrl } }, 6500);
      if (!sbPage || !sbPage.ok || !sbPage.text) return [];
      var hunterRegex = /decodeURIComponent\(escape\(r\)\)\}\(\s*["']([^"']+)["']\s*,\s*(\d+)\s*,\s*["']([^"']+)["']\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g;
      var hosterUrls = [];
      var hm;
      while ((hm = hunterRegex.exec(sbPage.text)) !== null) {
        var decoded = decodeHunter(hm[1], Number(hm[2]), hm[3], Number(hm[4]), Number(hm[5]));
        var vpMatch = decoded.match(/https?:\/\/[^\s"'<>]+\/videoplayback\.php\?hash=[a-zA-Z0-9]+/);
        if (vpMatch && hosterUrls.indexOf(vpMatch[0]) === -1) {
          hosterUrls.push(vpMatch[0]);
        }
      }
      var directVpRe = /https?:\/\/[^\s"'<>]+\/videoplayback\.php\?hash=[a-zA-Z0-9]+/g;
      var dvm;
      while ((dvm = directVpRe.exec(sbPage.text)) !== null) {
        if (hosterUrls.indexOf(dvm[0]) === -1) hosterUrls.push(dvm[0]);
      }
      if (hosterUrls.length === 0) return [];
      var displayLabel = targetEpTitle || (matchedSeries && matchedSeries.cat_name || meta.hungarianTitle || meta.englishTitle) + " S" + meta.season + "E" + meta.episode;
      var seenLocs = {};
      var streams = [];
      yield Promise.allSettled(hosterUrls.slice(0, 6).map(function(vpUrl) {
        return __async(this, null, function* () {
          if (budget.expired(2500)) return;
          var loc = yield resolveRedirectUrl(vpUrl, { headers: { Referer: goUrl } }, 6e3);
          if (!loc || isDownloadOnlyHost(loc) || seenLocs[loc]) return;
          seenLocs[loc] = true;
          var resolved = yield resolveAnyEmbed(loc, "Sorozatok.net", displayLabel, meta, "Magyar Szinkron");
          for (var ri = 0; ri < resolved.length; ri++) {
            streams.push(resolved[ri]);
          }
        });
      }));
      return finalizeStreams(streams);
    } catch (_) {
      return [];
    }
  });
}
module.exports = {
  getStreams
};
