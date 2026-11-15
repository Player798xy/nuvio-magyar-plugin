'use strict';

var {
  base64ToBytes,
  bytesToUtf8,
  decodeHtmlEntities,
  normalizeHttpUrl,
  rc4DecryptBytesToUtf8,
  safeParseUrl
} = require('./bytes');
var {
  UA,
  fetchJson,
  fetchText,
  getHeader,
  getOrigin,
  safeFetch
} = require('./http');
var {
  decryptBysePlayback,
  decryptRpmHex,
  decodeVoePayload,
  generalUnpack,
  unpackPacker
} = require('./crypto_decoders');
var {
  extractUploadYearFromText,
  isValidRuntime
} = require('./meta');

var DOWNLOAD_ONLY_HOSTS = [
  'frdl.io', 'fredl.ru', 'katfile.', 'uploady.', 'rapidgator.', 'turbobit.',
  'nitroflare.', 'ddownload.', '1fichier.', 'mega.nz', 'mediafire.com',
  'diablotorrent', 'myupload.us', 'filefactory'
];

function isDownloadOnlyHost(url) {
  var lower = String(url || '').toLowerCase();
  return DOWNLOAD_ONLY_HOSTS.some(function (h) {
    return lower.indexOf(h) !== -1;
  });
}

function inferHeight(text, fallback) {
  var s = String(text || '');
  if (/\b2160p?\b|\b4k\b|\buhd\b/i.test(s)) return 2160;
  if (/\b1440p?\b|\b2k\b/i.test(s)) return 1440;
  if (/\b1080p?\b|\bfhd\b|\bfull\s*hd\b/i.test(s)) return 1080;
  if (/\b720p?\b/i.test(s)) return 720;
  if (/\b480p?\b|\bsd\b|\bdvd\b/i.test(s)) return 480;
  if (/\b360p?\b/i.test(s)) return 360;
  return fallback || 720;
}

function parseQualityHeight(qualityOrUrl, fallback) {
  if (typeof qualityOrUrl === 'number' && Number.isFinite(qualityOrUrl)) return qualityOrUrl;
  var m = String(qualityOrUrl || '').match(/(\d{3,4})/);
  if (m) return parseInt(m[1], 10);
  return fallback || 720;
}

function normalizeLanguageLabel(lang) {
  var s = String(lang || '').trim();
  if (!s) return 'Magyar Szinkron';
  return s;
}

function getLangRank(langLabel) {
  var l = String(langLabel || '').toLowerCase();
  if (l.indexOf('felirat') !== -1 || l.indexOf('sub') !== -1) return 1;
  if (l.indexOf('külföldi') !== -1 || l.indexOf('kulfoldi') !== -1 || l.indexOf('eng') !== -1) return 2;
  return 0;
}

function cleanHeaders(headers) {
  if (!headers || typeof headers !== 'object') return undefined;
  var out = {};
  var count = 0;
  for (var k in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, k) && headers[k]) {
      var lk = k.toLowerCase();
      if (lk === 'x-forwarded-for' || lk === 'x-real-ip' || lk === 'client-ip') continue;
      out[k] = String(headers[k]);
      count++;
    }
  }
  return count > 0 ? out : undefined;
}

function buildNuvioStream(opts) {
  var rawUrl = normalizeHttpUrl(opts && opts.url);
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) return null;

  var height = parseQualityHeight(opts.height || opts.quality, 720);
  var qStr = opts.quality && /^\d{3,4}p$/i.test(String(opts.quality))
    ? String(opts.quality)
    : (height + 'p');
  var isHls = opts.isHls != null ? Boolean(opts.isHls) : /\.m3u8(\?|$)/i.test(rawUrl);
  var mediaType = isHls ? 'hls' : 'mp4';
  var kindBadge = isHls ? 'HLS' : 'MP4';

  var provider = opts.provider || 'Magyar';
  var hoster = opts.hoster || '';
  var language = normalizeLanguageLabel(opts.language);
  var langSuffix = getLangRank(language) === 1 ? ' (Felirat)' : (getLangRank(language) === 2 ? ' (ENG)' : '');

  var name = provider + (hoster ? ' • ' + hoster : '') + langSuffix + ' [' + qStr + ' ' + kindBadge + ']';
  var titlePrefix = opts.title ? opts.title + ' • ' : '';
  var title = titlePrefix + provider + (hoster ? ' (' + hoster + ')' : '') + ' • ' + qStr + ' ' + kindBadge + ' • ' + language;

  var streamObj = {
    name: name,
    title: title,
    url: rawUrl,
    quality: qStr,
    language: language,
    provider: provider,
    type: mediaType,
    _height: height,
    _langRank: getLangRank(language)
  };

  var reqHeaders = cleanHeaders(opts.headers);
  if (reqHeaders) streamObj.headers = reqHeaders;

  return streamObj;
}

function finalizeStreams(streams) {
  if (!Array.isArray(streams)) return [];
  var seen = {};
  var deduped = [];
  for (var i = 0; i < streams.length; i++) {
    var s = streams[i];
    if (!s || typeof s.url !== 'string' || !/^https?:\/\//i.test(s.url)) continue;
    var key = s.url.trim();
    if (seen[key]) continue;
    seen[key] = true;
    deduped.push(s);
  }

  deduped.sort(function (a, b) {
    var lrA = a._langRank != null ? a._langRank : getLangRank(a.language);
    var lrB = b._langRank != null ? b._langRank : getLangRank(b.language);
    if (lrA !== lrB) return lrA - lrB;
    var hA = a._height || parseQualityHeight(a.quality, 720);
    var hB = b._height || parseQualityHeight(b.quality, 720);
    if (hA !== hB) return hB - hA;
    if (a.type !== b.type) return a.type === 'hls' ? -1 : 1;
    return 0;
  });

  return deduped.map(function (s) {
    var clean = {
      name: s.name,
      title: s.title,
      url: s.url,
      quality: s.quality,
      language: s.language,
      provider: s.provider,
      type: s.type
    };
    if (s.headers) clean.headers = s.headers;
    return clean;
  });
}

// ---------------------------------------------------------------------------
// 1. Videa.hu & Videakid.hu (RC4 _xt + noembed f= fallback)
// ---------------------------------------------------------------------------

var VIDEA_STATIC_SECRET = 'xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJIS4NasXWKy1td7p';

function computeVideaParams(_xt) {
  var e = String(_xt || '').split('');
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var t = '';
  for (var i = 0; i < 8; i++) {
    t += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  var c = {};
  var r = ['e', 'a', 'g', 'j', 'd', 'c', 'h', 'i', 'b', 'f'];
  for (var j = 0; j < e.length; j++) {
    if (j % 8 === 0) c[r[Math.floor(j / 8) + 1]] = '';
    c[r[Math.floor(j / 8) + 1]] += e[j];
  }
  c[r[0]] = t;

  var d = (c.a || '') + (c.g || '') + (c.j || '') + (c.d || '');
  var u = (c.c || '') + (c.h || '') + (c.i || '') + (c.b || '');
  var m = '';
  for (var k = 0; k < d.length; k++) {
    m += u.charAt(k - (VIDEA_STATIC_SECRET.indexOf(d.charAt(k)) - 31));
  }

  r = ['f', 'h', 'c', 'b', 'i'];
  for (var x = 0; x < m.length; x++) {
    if (x % 8 === 0) c[r[Math.floor(x / 8) + 1]] = '';
    c[r[Math.floor(x / 8) + 1]] += m.charAt(x);
  }
  c[r[0]] = '';

  return {
    _s: c.e || '',
    _t: (c.h || '') + (c.c || ''),
    buildKey: function (xs) {
      return (c.b || '') + (c.i || '') + (c.e || '') + (xs || '');
    }
  };
}

function parseVideaXml(xmlStr, htmlStr, baseDomain) {
  if (!xmlStr || xmlStr.indexOf('<video_source') === -1 || xmlStr.indexOf('<error') !== -1) {
    return null;
  }

  var titleMatch = xmlStr.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || xmlStr.match(/<title>([^<]+)<\/title>/i);
  var durationMatch = xmlStr.match(/<duration>(\d+)<\/duration>/i);
  var videoTitle = decodeHtmlEntities(titleMatch ? titleMatch[1].trim() : 'Videa Stream');
  var duration = durationMatch ? parseInt(durationMatch[1], 10) : 0;
  var uploadYear = extractUploadYearFromText(xmlStr) || extractUploadYearFromText(htmlStr);

  var headers = {
    Referer: baseDomain + '/',
    Origin: baseDomain,
    'User-Agent': UA
  };

  var sources = [];
  var sourceRegex = /<video_source\s+([^>]+)>([^<]+)<\/video_source>/g;
  var match;
  while ((match = sourceRegex.exec(xmlStr)) !== null) {
    var attrs = match[1];
    var url = normalizeHttpUrl(match[2].trim(), baseDomain);
    if (!url) continue;

    var nameMatch = attrs.match(/name="([^"]+)"/);
    var heightMatch = attrs.match(/height="([^"]+)"/);
    var expMatch = attrs.match(/exp="([^"]+)"/);

    var name = nameMatch ? nameMatch[1] : 'unknown';
    var height = heightMatch ? parseInt(heightMatch[1], 10) : inferHeight(name, 480);
    var exp = expMatch ? expMatch[1] : '';

    var hashMatch = xmlStr.match(new RegExp('<hash_value_' + name + '>([^<]+)</hash_value_' + name + '>'));
    if (hashMatch && exp) {
      url += (url.indexOf('?') !== -1 ? '&' : '?') + 'md5=' + hashMatch[1] + '&expires=' + exp;
    }

    sources.push({
      name: name,
      height: height,
      quality: height + 'p',
      url: url,
      videoTitle: videoTitle,
      duration: duration,
      uploadYear: uploadYear,
      headers: headers
    });
  }

  sources.sort(function (a, b) { return b.height - a.height; });
  return { videoTitle: videoTitle, duration: duration, uploadYear: uploadYear, sources: sources };
}

async function fetchVideaXml(queryParam, baseDomain) {
  var playerUrl = baseDomain + '/player?' + queryParam;
  var playerRes = await fetchText(playerUrl, { headers: { Referer: baseDomain + '/' } }, 6500);
  if (!playerRes || !playerRes.ok || !playerRes.text) return null;

  var nonceMatch = playerRes.text.match(/_xt\s*=\s*"([^"]+)"/);
  if (!nonceMatch) return null;

  var params = computeVideaParams(nonceMatch[1]);
  var xmlUrl = baseDomain + '/player/xml?' + queryParam + '&_s=' + encodeURIComponent(params._s) + '&_t=' + encodeURIComponent(params._t);
  var xmlRes = await fetchText(xmlUrl, { headers: { Referer: playerUrl } }, 6500);
  if (!xmlRes || !xmlRes.text) return null;

  var raw = xmlRes.text;
  var xmlStr = '';
  if (raw.indexOf('<?xml') === 0 || raw.indexOf('<videa_video') !== -1 || raw.indexOf('<error') !== -1) {
    xmlStr = raw;
  } else {
    var xs = getHeader(xmlRes.headers, 'x-videa-xs');
    var key = params.buildKey(xs);
    xmlStr = rc4DecryptBytesToUtf8(base64ToBytes(raw), key);
  }

  return { xmlStr: xmlStr, htmlStr: playerRes.text };
}

async function extractVideaInfo(vcodeOrUrl, forcedDomain) {
  try {
    var input = decodeHtmlEntities(String(vcodeOrUrl || '').trim());
    if (!input) return null;
    if (input.indexOf('//') === 0) input = 'https:' + input;

    var baseDomain = forcedDomain || (input.indexOf('videakid.hu') !== -1 ? 'https://videakid.hu' : 'https://videa.hu');

    // Direct f= embed parameter
    var fParamMatch = input.match(/[?&]f=([a-zA-Z0-9._-]+)/);
    if (fParamMatch) {
      var fFetched = await fetchVideaXml('f=' + encodeURIComponent(fParamMatch[1]) + '&s=%7B%22loc%22%3A1%7D', baseDomain);
      if (fFetched) {
        var fParsed = parseVideaXml(fFetched.xmlStr, fFetched.htmlStr, baseDomain);
        if (fParsed && fParsed.sources.length > 0) return fParsed;
      }
    }

    // Standard vcode extraction
    var vcode = input;
    if (/^https?:\/\//i.test(input)) {
      var vMatch = input.match(/[?&]v=([a-zA-Z0-9_-]+)/);
      var slugMatch = input.match(/[-/]([a-zA-Z0-9]{16})(?:[?&#]|$)/);
      if (vMatch) vcode = vMatch[1];
      else if (slugMatch) vcode = slugMatch[1];
    }

    if (vcode && vcode.indexOf('http') !== 0) {
      var fetched = await fetchVideaXml('v=' + encodeURIComponent(vcode), baseDomain);
      if (fetched && fetched.xmlStr) {
        if (fetched.xmlStr.indexOf('panelstyle="noembed"') !== -1) {
          var pageUrlMatch = fetched.xmlStr.match(/<error[^>]*>(https?:\/\/[^<]+)<\/error>/);
          var pageTarget = (pageUrlMatch && pageUrlMatch[1]) || (/^https?:\/\//i.test(input) ? input : '');
          if (pageTarget) {
            var pageRes = await fetchText(pageTarget, { headers: { Referer: baseDomain + '/' } }, 5500);
            if (pageRes && pageRes.ok && pageRes.text) {
              var pageFMatch = pageRes.text.match(/\/player\?f=([a-zA-Z0-9_.]+)/);
              if (pageFMatch) {
                var noembedFetched = await fetchVideaXml('f=' + encodeURIComponent(pageFMatch[1]) + '&s=%7B%22loc%22%3A1%7D', baseDomain);
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

    // Fallback: inspect player page URL directly for canonical 16-char vcode or f= code
    if (/^https?:\/\//i.test(input)) {
      var fallbackRes = await fetchText(input, { headers: { Referer: baseDomain + '/' } }, 5500);
      if (fallbackRes && fallbackRes.ok && fallbackRes.text) {
        var fFallback = fallbackRes.text.match(/\/player\?f=([a-zA-Z0-9_.]+)/);
        if (fFallback) {
          var ff = await fetchVideaXml('f=' + encodeURIComponent(fFallback[1]) + '&s=%7B%22loc%22%3A1%7D', baseDomain);
          if (ff) {
            var fp = parseVideaXml(ff.xmlStr, ff.htmlStr, baseDomain);
            if (fp && fp.sources.length > 0) return fp;
          }
        }
        var cMatch = fallbackRes.text.match(/[-/]([a-zA-Z0-9]{16})(?:["'?&#]|$)/);
        if (cMatch && cMatch[1] !== vcode) {
          var cf = await fetchVideaXml('v=' + encodeURIComponent(cMatch[1]), baseDomain);
          if (cf) return parseVideaXml(cf.xmlStr, cf.htmlStr, baseDomain);
        }
      }
    }
  } catch (_) {}
  return null;
}

async function resolveVideaEmbed(iframeSrc, forcedDomain) {
  var info = await extractVideaInfo(iframeSrc, forcedDomain);
  return info ? info.sources : [];
}

async function extractVideaStreams(vcodeOrUrl, providerLabel, customTitle, languageLabel) {
  var info = await extractVideaInfo(vcodeOrUrl);
  if (!info || !info.sources.length) return [];
  var out = [];
  for (var i = 0; i < info.sources.length; i++) {
    var src = info.sources[i];
    var s = buildNuvioStream({
      url: src.url,
      provider: providerLabel || 'Videa',
      hoster: 'Videa',
      title: customTitle || info.videoTitle,
      quality: src.quality,
      height: src.height,
      language: languageLabel || 'Magyar Szinkron',
      isHls: false,
      headers: src.headers
    });
    if (s) out.push(s);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. Indavideo.hu
// ---------------------------------------------------------------------------

async function extractIndavideoInfo(urlOrHash) {
  var input = String(urlOrHash || '').trim();
  if (!input) return null;

  try {
    var embHash = null;
    var pageHtml = '';
    var directHash = input.match(/embed\.indavideo\.hu\/player\/video\/([a-fA-F0-9]{8,16})/i);
    if (directHash) {
      embHash = directHash[1];
    } else if (/^[a-fA-F0-9]{10,12}$/.test(input)) {
      embHash = input;
    } else {
      var pageUrl = /^https?:\/\//i.test(input) ? normalizeHttpUrl(input) : ('https://indavideo.hu/video/' + input);
      var pageRes = await fetchText(pageUrl, { headers: { Referer: 'https://indavideo.hu/' } }, 6000);
      if (pageRes && pageRes.ok && pageRes.text) {
        pageHtml = pageRes.text;
        var hm =
          pageHtml.match(/id=['"]emb_hash['"][^>]+value=['"]([^'"]+)['"]/i) ||
          pageHtml.match(/value=['"]([^'"]+)['"][^>]+id=['"]emb_hash['"]/i) ||
          pageHtml.match(/embed\.indavideo\.hu\/player\/video\/([a-zA-Z0-9]+)/i);
        if (hm) embHash = hm[1];
      }
    }

    if (!embHash) return null;

    var rnd = Math.floor(Math.random() * 2147483647);
    var dataUrl = 'https://amfphp.indavideo.hu/SYm0json.php/player.playerHandler.getVideoData/' + embHash + '/12/?callback=json&_=' + rnd;
    var res = await fetchText(dataUrl, { headers: { Referer: 'https://embed.indavideo.hu/' } }, 6000);
    if (!res || !res.ok || !res.text) return null;

    var txt = res.text.trim();
    if (txt.indexOf('json(') === 0) txt = txt.slice(5, txt.lastIndexOf(')'));
    var parsed = JSON.parse(txt);
    var data = parsed && parsed.data;
    if (!data) return null;

    var duration = data.length ? parseInt(data.length, 10) : (data.duration ? parseInt(data.duration, 10) : 0);
    var uploadYear = extractUploadYearFromText(String(data.date || '')) || extractUploadYearFromText(txt) || extractUploadYearFromText(pageHtml);
    var videoTitle = decodeHtmlEntities(data.title || '');
    var filesh = data.filesh || {};

    var videoFiles = [];
    if (Array.isArray(data.video_files)) {
      videoFiles = data.video_files.slice();
    } else if (data.video_files && typeof data.video_files === 'object') {
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
      Referer: 'https://indavideo.hu/',
      Origin: 'https://indavideo.hu',
      'User-Agent': UA
    };

    var seenHeights = {};
    var sources = [];
    var fallbackToken = '';
    for (var tk in filesh) {
      if (Object.prototype.hasOwnProperty.call(filesh, tk) && filesh[tk]) {
        fallbackToken = filesh[tk];
        break;
      }
    }

    for (var i = 0; i < videoFiles.length; i++) {
      var vUrl = videoFiles[i];
      if (!vUrl || typeof vUrl !== 'string') continue;
      var hm = vUrl.match(/\.(\d{3,4})\.mp4/);
      var height = hm ? parseInt(hm[1], 10) : 360;
      if (seenHeights[height]) continue;
      seenHeights[height] = true;

      var token = filesh[String(height)] || filesh[height] || fallbackToken;
      var finalUrl = normalizeHttpUrl(vUrl).replace('??', '?');
      if (token) {
        finalUrl += (finalUrl.indexOf('?') !== -1 ? '&' : '?') + 'token=' + token;
      }
      sources.push({
        height: height,
        quality: height + 'p',
        url: finalUrl,
        duration: duration,
        uploadYear: uploadYear,
        videoTitle: videoTitle,
        headers: headers
      });
    }

    sources.sort(function (a, b) { return b.height - a.height; });
    return {
      videoTitle: videoTitle,
      duration: duration,
      uploadYear: uploadYear,
      sources: sources,
      streams: sources // compatibility alias for callers expecting .streams
    };
  } catch (_) {
    return null;
  }
}

async function extractIndavideoStreams(urlOrHash, providerLabel, customTitle, languageLabel) {
  var info = await extractIndavideoInfo(urlOrHash);
  if (!info || !info.sources.length) return [];
  var out = [];
  for (var i = 0; i < info.sources.length; i++) {
    var src = info.sources[i];
    var s = buildNuvioStream({
      url: src.url,
      provider: providerLabel || 'Indavideo',
      hoster: 'Indavideo',
      title: customTitle || info.videoTitle,
      quality: src.quality,
      height: src.height,
      language: languageLabel || 'Magyar Szinkron',
      isHls: false,
      headers: src.headers
    });
    if (s) out.push(s);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. OK.ru (Odnoklassniki)
// ---------------------------------------------------------------------------

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
  var qKey = qualMatch && qualMatch[1] ? qualMatch[1].toLowerCase() : '';
  if (OKRU_QUALITY_MAP[qKey]) return OKRU_QUALITY_MAP[qKey];

  var path = String(trackPath || '');
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

async function parseOkMasterTracks(masterUrl, reqHeaders, appendIndexM3u8) {
  var tracks = [];
  if (!masterUrl) return tracks;
  var res = await fetchText(masterUrl, { headers: reqHeaders }, 5000);
  if (!res || !res.ok || !res.text) return tracks;

  var lines = res.text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('#EXT-X-STREAM-INF') === 0) {
      var nextLine = lines[i + 1];
      if (nextLine && nextLine.charAt(0) !== '#') {
        var height = resolveOkTrackHeight(lines[i], nextLine);
        if (height >= 360) {
          var trackUrl = normalizeHttpUrl(nextLine, masterUrl);
          if (appendIndexM3u8 && !/\.m3u8(\?|$)/i.test(trackUrl)) {
            trackUrl = trackUrl.replace(/\/?$/, '/') + 'index.m3u8';
          }
          tracks.push({ height: height, url: trackUrl });
        }
      }
    }
  }
  return tracks;
}

async function extractOkRuStreams(embedUrl, providerLabel, customTitleOrMeta, mediaMeta, languageLabel) {
  var customTitle = typeof customTitleOrMeta === 'string' ? customTitleOrMeta : '';
  var meta = typeof customTitleOrMeta === 'object' ? customTitleOrMeta : (mediaMeta || null);
  var streams = [];

  try {
    var url = normalizeHttpUrl(embedUrl, 'https://ok.ru/');
    var reqHeaders = { Referer: 'https://ok.ru/', Origin: 'https://ok.ru', 'User-Agent': UA };
    var res = await fetchText(url, { headers: { Referer: 'https://ok.ru/' } }, 6000);
    if (!res || !res.ok || !res.text) return streams;

    var optsMatch = res.text.match(/data-options="([^"]+)"/i);
    if (!optsMatch) return streams;

    var opts = JSON.parse(decodeHtmlEntities(optsMatch[1]));
    var okMeta = opts && opts.flashvars && opts.flashvars.metadata ? JSON.parse(opts.flashvars.metadata) : null;
    if (!okMeta) return streams;

    var durSec = okMeta.movie && okMeta.movie.duration ? parseInt(okMeta.movie.duration, 10) : 0;
    if (meta && durSec > 0 && !isValidRuntime(durSec, meta)) {
      return [];
    }

    var titleText = customTitle || (okMeta.movie && okMeta.movie.title) || '';
    var seenHeights = {};

    var hlsSources = [
      { url: okMeta.ondemandHls, appendIndex: false },
      { url: okMeta.hlsManifestUrl, appendIndex: true }
    ];

    for (var s = 0; s < hlsSources.length; s++) {
      if (!hlsSources[s].url) continue;
      var tracks = await parseOkMasterTracks(hlsSources[s].url, reqHeaders, hlsSources[s].appendIndex);
      for (var t = 0; t < tracks.length; t++) {
        var tr = tracks[t];
        if (seenHeights[tr.height]) continue;
        seenHeights[tr.height] = true;
        var st = buildNuvioStream({
          url: tr.url,
          provider: providerLabel || 'OK.ru',
          hoster: 'OK.ru',
          title: titleText,
          quality: tr.height + 'p',
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
          provider: providerLabel || 'OK.ru',
          hoster: 'OK.ru',
          title: titleText,
          quality: h + 'p',
          height: h,
          language: languageLabel,
          isHls: false,
          headers: reqHeaders
        });
        if (mp4St) streams.push(mp4St);
      }
    }
  } catch (_) {}

  return streams;
}

// ---------------------------------------------------------------------------
// 4. Vidmoly
// ---------------------------------------------------------------------------

async function extractVidmoly(embedUrl, providerLabel, customTitle, languageLabel) {
  var streams = [];
  try {
    var url = normalizeHttpUrl(embedUrl);
    var wMatch = url.match(/\/w\/([a-zA-Z0-9]+)/);
    if (wMatch) {
      url = 'https://vidmoly.biz/embed-' + wMatch[1] + '.html';
    } else if (url.indexOf('/embed-') !== -1) {
      url = url.replace(/https?:\/\/[^/]+/, 'https://vidmoly.biz');
    }
    var res = await fetchText(url, { headers: { Referer: 'https://vidmoly.biz/' } }, 6500);
    if (!res || !res.ok || !res.text) return streams;

    var m3u8 = res.text.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
    if (m3u8) {
      var origin = getOrigin(res.url || url) || 'https://vidmoly.biz';
      var st = buildNuvioStream({
        url: m3u8[1],
        provider: providerLabel || 'Vidmoly',
        hoster: 'Vidmoly',
        title: customTitle,
        quality: '1080p',
        height: 1080,
        language: languageLabel,
        isHls: true,
        headers: { Referer: origin + '/', Origin: origin, 'User-Agent': UA }
      });
      if (st) streams.push(st);
    }
  } catch (_) {}
  return streams;
}

// ---------------------------------------------------------------------------
// 5. VOE (Direct, multi-mirror, zero Vercel skip)
// ---------------------------------------------------------------------------

async function extractVoe(embedUrl, providerLabel, customTitle, languageLabel) {
  var streams = [];
  try {
    var currentUrl = normalizeHttpUrl(embedUrl);
    var slugMatch = currentUrl.match(/(?:voe\.[a-z]+|susanexpectcare\.com)\/(?:e\/|d\/)?([a-zA-Z0-9]+)/i);
    var slug = slugMatch ? slugMatch[1] : null;
    if (slug && currentUrl.indexOf('voe.') !== -1 && currentUrl.indexOf('/e/') === -1) {
      currentUrl = 'https://voe.sx/e/' + slug;
    }

    var html = '';
    for (var hop = 0; hop < 3; hop++) {
      var res = await fetchText(currentUrl, { headers: { Referer: 'https://voe.sx/' } }, 6000);
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

    if ((!html || /ddos-guard/i.test(html) || html.length < 2000) && slug) {
      var mirrorUrl = 'https://susanexpectcare.com/' + slug;
      var mirrorRes = await fetchText(mirrorUrl, { headers: { Referer: 'https://voe.sx/' } }, 6000);
      if (mirrorRes && mirrorRes.ok && mirrorRes.text &&
          (mirrorRes.text.indexOf('<script type="application/json">') !== -1 || mirrorRes.text.indexOf('hls') !== -1)) {
        currentUrl = mirrorRes.url || mirrorUrl;
        html = mirrorRes.text;
      }
    }

    if (!html) return streams;

    var origin = getOrigin(currentUrl) || 'https://voe.sx';
    var headers = { Referer: origin + '/', Origin: origin, 'User-Agent': UA };

    var jsonScriptMatch = html.match(/<script[^>]*type=["']application\/json["'][^>]*>\s*\["([^"]+)"\]\s*<\/script>/i);
    if (jsonScriptMatch) {
      var data = decodeVoePayload(jsonScriptMatch[1]);
      if (data) {
        var hlsUrl = data.source || data.file;
        if (hlsUrl && /^https?:\/\//i.test(hlsUrl)) {
          var s1 = buildNuvioStream({
            url: hlsUrl,
            provider: providerLabel || 'VOE',
            hoster: 'VOE',
            title: customTitle,
            quality: '1080p',
            height: 1080,
            language: languageLabel,
            isHls: true,
            headers: headers
          });
          if (s1) streams.push(s1);
        }
        if (data.direct_access_url && /^https?:\/\//i.test(data.direct_access_url)) {
          var s2 = buildNuvioStream({
            url: data.direct_access_url,
            provider: providerLabel || 'VOE',
            hoster: 'VOE',
            title: customTitle,
            quality: '720p',
            height: 720,
            language: languageLabel,
            isHls: false,
            headers: headers
          });
          if (s2) streams.push(s2);
        }
      }
    }

    if (streams.length === 0) {
      var hlsMatch = html.match(/['"]hls['"]\s*:\s*['"]([^'"]+)['"]/i);
      if (hlsMatch && hlsMatch[1]) {
        var u = hlsMatch[1];
        if (u.indexOf('http') !== 0) {
          try { u = bytesToUtf8(base64ToBytes(u)); } catch (_) {}
        }
        if (/^https?:\/\//i.test(u)) {
          var sf = buildNuvioStream({
            url: u,
            provider: providerLabel || 'VOE',
            hoster: 'VOE',
            title: customTitle,
            quality: '1080p',
            height: 1080,
            language: languageLabel,
            isHls: true,
            headers: headers
          });
          if (sf) streams.push(sf);
        }
      }
    }
  } catch (_) {}
  return streams;
}

// ---------------------------------------------------------------------------
// 6. RPMShare / RPMStream / RPMVid (AES-128-CBC + HLS variant parsing)
// ---------------------------------------------------------------------------

async function extractRpmStream(rpmUrlOrId, referer, providerLabel, customTitle, languageLabel) {
  var videoId = String(rpmUrlOrId || '').trim();
  var hashMatch = videoId.match(/#([a-zA-Z0-9]+)/);
  if (hashMatch) {
    videoId = hashMatch[1];
  } else if (/^https?:\/\//i.test(videoId)) {
    var idMatch = videoId.match(/\/([a-zA-Z0-9]{5,24})$/);
    if (idMatch) videoId = idMatch[1];
  }
  if (!videoId || videoId.length < 4) return [];

  var refHost = 'hdmozi.hu';
  var parsedRef = safeParseUrl(referer);
  if (parsedRef && parsedRef.hostname) refHost = parsedRef.hostname;

  var hosts = [
    'https://rpmshare.rpmstream.live',
    'https://rpmvid.com',
    'https://rpmhub.site'
  ];

  for (var i = 0; i < hosts.length; i++) {
    var host = hosts[i];
    try {
      var apiUrl = host + '/api/v1/video?id=' + encodeURIComponent(videoId) + '&w=1920&h=1080&r=' + encodeURIComponent(refHost);
      var res = await fetchText(apiUrl, { headers: { Referer: host + '/#' + videoId, Origin: host } }, 6000);
      if (!res || !res.ok || !res.text) continue;

      var data = decryptRpmHex(res.text);
      if (!data) continue;
      var masterUrl = data.hls || data.source || data.file;
      if (!masterUrl || !/^https?:\/\//i.test(masterUrl)) continue;

      var headers = { Referer: host + '/', Origin: host, 'User-Agent': UA };
      var streamTitle = customTitle || data.title || '';

      var variants = [];
      var masterRes = await fetchText(masterUrl, { headers: { Referer: host + '/', Origin: host } }, 4500);
      if (masterRes && masterRes.ok && masterRes.text) {
        var mu = safeParseUrl(masterUrl);
        var vParam = mu && mu.searchParams ? mu.searchParams.get('v') : null;
        var lines = masterRes.text.split(/\r?\n/);
        var lastInf = null;
        for (var l = 0; l < lines.length; l++) {
          var line = lines[l].trim();
          if (!line) continue;
          if (line.indexOf('#EXT-X-STREAM-INF') === 0) {
            lastInf = line;
          } else if (line.charAt(0) !== '#' && lastInf) {
            var vUrl = safeParseUrl(line, masterUrl);
            if (vUrl) {
              if (vParam && vUrl.searchParams && !vUrl.searchParams.has('v')) {
                vUrl.searchParams.set('v', vParam);
              }
              var resM = lastInf.match(/RESOLUTION=(\d+)x(\d+)/i);
              var h = resM ? parseInt(resM[2], 10) : 720;
              var q = h >= 2160 ? '2160p' : h >= 1440 ? '1440p' : h >= 1080 ? '1080p' : h >= 720 ? '720p' : h >= 480 ? '480p' : (h + 'p');
              variants.push({ url: vUrl.href, quality: q, height: h });
            }
            lastInf = null;
          }
        }
      }

      var out = [];
      if (variants.length > 0) {
        for (var v = 0; v < variants.length; v++) {
          var st = buildNuvioStream({
            url: variants[v].url,
            provider: providerLabel || 'RPM',
            hoster: 'RPM',
            title: streamTitle,
            quality: variants[v].quality,
            height: variants[v].height,
            language: languageLabel,
            isHls: true,
            headers: headers
          });
          if (st) out.push(st);
        }
      } else {
        var fallbackSt = buildNuvioStream({
          url: masterUrl,
          provider: providerLabel || 'RPM',
          hoster: 'RPM',
          title: streamTitle,
          quality: '1080p',
          height: 1080,
          language: languageLabel,
          isHls: true,
          headers: headers
        });
        if (fallbackSt) out.push(fallbackSt);
      }

      if (out.length > 0) return out;
    } catch (_) {}
  }
  return [];
}

// ---------------------------------------------------------------------------
// 7. Packer, StreamRuby, vTube, LuluVid, MixDrop, Vidara, Byse/Filemoon
// ---------------------------------------------------------------------------

async function extractPackerHoster(embedUrl, providerLabel, customTitle, hostName, languageLabel) {
  var streams = [];
  try {
    var url = normalizeHttpUrl(embedUrl);
    var res = await fetchText(url, { headers: { Referer: url } }, 6000);
    if (!res || !res.ok || !res.text) return streams;

    var unpackedList = generalUnpack(res.text);
    var singleUnpacked = unpackPacker(res.text);
    if (singleUnpacked) unpackedList.push(singleUnpacked);
    var haystack = unpackedList.join('\n') + '\n' + res.text;

    var origin = getOrigin(res.url || url) || getOrigin(url);
    var headers = origin ? { Referer: origin + '/', Origin: origin, 'User-Agent': UA } : { 'User-Agent': UA };
    var seen = {};

    var reM3u8 = /(https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*)/gi;
    var m;
    while ((m = reM3u8.exec(haystack)) !== null) {
      var u = m[1].replace(/\\+/g, '');
      if (seen[u]) continue;
      seen[u] = true;
      var st = buildNuvioStream({
        url: u,
        provider: providerLabel || hostName,
        hoster: hostName,
        title: customTitle,
        quality: '1080p',
        height: 1080,
        language: languageLabel,
        isHls: true,
        headers: headers
      });
      if (st) streams.push(st);
    }

    if (streams.length === 0) {
      var reMp4 = /(https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*)/gi;
      var mm;
      while ((mm = reMp4.exec(haystack)) !== null) {
        var mu = mm[1].replace(/\\+/g, '');
        if (seen[mu] || mu.indexOf('Big_Buck_Bunny') !== -1) continue;
        seen[mu] = true;
        var ms = buildNuvioStream({
          url: mu,
          provider: providerLabel || hostName,
          hoster: hostName,
          title: customTitle,
          quality: '720p',
          height: 720,
          language: languageLabel,
          isHls: false,
          headers: headers
        });
        if (ms) streams.push(ms);
      }
    }
  } catch (_) {}
  return streams;
}

async function extractStreamRuby(url, providerLabel, customTitle, languageLabel) {
  try {
    var startUrl = normalizeHttpUrl(url);
    var res = await fetchText(startUrl, { headers: { Referer: 'https://mindjart.megnezed.com/' } }, 6500);
    var html = (res && res.text) || '';
    var refUrl = (res && res.url) || startUrl;
    var m3u8 = html.match(/https?:\/\/[^\s"'`<>]+\.m3u8[^\s"'`<>]*/i);

    if (!m3u8) {
      var u = safeParseUrl(refUrl);
      var code = u ? u.pathname.replace(/^\/+/, '').replace(/\.html$/i, '').replace(/^embed-/, '') : '';
      if (code && u) {
        var embedUrl = u.origin + '/embed-' + code + '.html';
        var er = await fetchText(embedUrl, { headers: { Referer: refUrl } }, 6000);
        if (er && er.text) {
          html = er.text;
          refUrl = er.url || embedUrl;
          m3u8 = html.match(/https?:\/\/[^\s"'`<>]+\.m3u8[^\s"'`<>]*/i);
        }
      }
    }
    if (!m3u8) return [];
    var origin = getOrigin(refUrl);
    var pageTitle = (html.match(/<title>([^<]+)<\/title>/i) || [])[1] || '';
    var st = buildNuvioStream({
      url: m3u8[0],
      provider: providerLabel || 'StreamRuby',
      hoster: 'StreamRuby',
      title: customTitle,
      height: inferHeight(pageTitle, 720),
      language: languageLabel,
      isHls: true,
      headers: { Referer: origin + '/', Origin: origin, 'User-Agent': UA }
    });
    return st ? [st] : [];
  } catch (_) {
    return [];
  }
}

async function extractVtube(url, providerLabel, customTitle, languageLabel) {
  try {
    var startUrl = normalizeHttpUrl(url);
    var res = await fetchText(startUrl, { headers: { Referer: 'https://mindjart.megnezed.com/' } }, 6500);
    if (!res || !res.text) return [];
    var m3u8 = res.text.match(/https?:\/\/[^\s"'`<>]+\.m3u8[^\s"'`<>]*/i);
    if (!m3u8) return [];
    var origin = getOrigin(res.url || startUrl);
    var pageTitle = (res.text.match(/<title>([^<]+)<\/title>/i) || [])[1] || '';
    var st = buildNuvioStream({
      url: m3u8[0],
      provider: providerLabel || 'vTube',
      hoster: 'vTube',
      title: customTitle,
      height: inferHeight(pageTitle, 720),
      language: languageLabel,
      isHls: true,
      headers: { Referer: origin + '/', Origin: origin, 'User-Agent': UA }
    });
    return st ? [st] : [];
  } catch (_) {
    return [];
  }
}

async function extractLuluvid(url, providerLabel, customTitle, languageLabel) {
  try {
    var u = safeParseUrl(url);
    if (!u) return [];
    var parts = u.pathname.split('/').filter(Boolean);
    var code = (parts[parts.length - 1] || '').replace(/\.html$/i, '');
    if (!code) return [];
    var embedUrl = u.origin + '/e/' + code;
    var res = await fetchText(embedUrl, { headers: { Referer: u.origin + '/' } }, 6500);
    if (!res || !res.text) return [];
    var haystack = generalUnpack(res.text).join('\n') + '\n' + res.text;
    var m3u8 = haystack.match(/https?:\/\/[^\s"'`<>]+\.m3u8[^\s"'`<>]*/i);
    if (!m3u8) return [];
    var pageTitle = (res.text.match(/<title>([^<]+)<\/title>/i) || [])[1] || '';
    var st = buildNuvioStream({
      url: m3u8[0],
      provider: providerLabel || 'LuluVid',
      hoster: 'LuluVid',
      title: customTitle,
      height: inferHeight(pageTitle, 720),
      language: languageLabel,
      isHls: true,
      headers: { Referer: u.origin + '/', Origin: u.origin, 'User-Agent': UA }
    });
    return st ? [st] : [];
  } catch (_) {
    return [];
  }
}

async function extractMixdrop(url, providerLabel, customTitle, languageLabel) {
  try {
    var u = safeParseUrl(url);
    if (!u) return [];
    var parts = u.pathname.split('/').filter(Boolean);
    var code = parts[1] || parts[0];
    if (!code) return [];
    var embedUrl = u.origin + '/e/' + code;
    var res = await fetchText(embedUrl, { headers: { Referer: u.origin + '/' } }, 6500);
    if (!res || !res.text) return [];
    var unpacked = generalUnpack(res.text).join('\n');
    var mp4Match = unpacked.match(/(?:MDCore\.)?wurl\s*=\s*["']([^"']+)["']/i);
    if (!mp4Match || mp4Match[1].trim().length < 5) return [];
    var mp4 = normalizeHttpUrl(mp4Match[1]);
    var pageTitle = (res.text.match(/<title>([^<]+)<\/title>/i) || [])[1] || '';
    var st = buildNuvioStream({
      url: mp4,
      provider: providerLabel || 'MixDrop',
      hoster: 'MixDrop',
      title: customTitle,
      height: inferHeight(pageTitle, 720),
      language: languageLabel,
      isHls: false,
      headers: { Referer: u.origin + '/', Origin: u.origin, 'User-Agent': UA }
    });
    return st ? [st] : [];
  } catch (_) {
    return [];
  }
}

async function extractVidara(url, providerLabel, customTitle, languageLabel) {
  try {
    var u = safeParseUrl(url);
    if (!u) return [];
    var m = u.pathname.match(/\/(?:v|e)\/([a-zA-Z0-9]+)/);
    var parts = u.pathname.split('/').filter(Boolean);
    var code = (m && m[1]) || parts[parts.length - 1];
    if (!code) return [];
    var data = await fetchJson(u.origin + '/api/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Referer: url,
        Origin: u.origin
      },
      body: JSON.stringify({ filecode: code })
    }, 6000);
    if (!data || !data.streaming_url || !/^https?:\/\//i.test(data.streaming_url)) return [];
    var st = buildNuvioStream({
      url: data.streaming_url,
      provider: providerLabel || 'Vidara',
      hoster: 'Vidara',
      title: customTitle || data.title || '',
      height: inferHeight(data.title || '', 720),
      language: languageLabel,
      isHls: true,
      headers: { Referer: u.origin + '/', Origin: u.origin, 'User-Agent': UA }
    });
    return st ? [st] : [];
  } catch (_) {
    return [];
  }
}

async function extractByse(url, providerLabel, customTitle, languageLabel) {
  try {
    var u = safeParseUrl(url);
    if (!u) return [];
    var m = u.pathname.match(/\/(?:d|e|v|f)\/([a-zA-Z0-9]+)/);
    var code = m && m[1];
    if (code) {
      var data = await fetchJson(u.origin + '/api/videos/' + code, {
        headers: { Referer: u.origin + '/e/' + code }
      }, 6500);
      if (data && data.playback) {
        var decrypted = await decryptBysePlayback(data.playback);
        if (decrypted && Array.isArray(decrypted.sources)) {
          var valid = decrypted.sources.filter(function (s) {
            return s && typeof s.url === 'string' && /^https?:\/\//i.test(s.url);
          });
          valid.sort(function (a, b) { return (b.height || 0) - (a.height || 0); });
          if (valid.length > 0) {
            var out = [];
            for (var i = 0; i < valid.length; i++) {
              var item = valid[i];
              var h = Number(item.height) || inferHeight(item.label || data.title || '', 720);
              var isHls = item.url.indexOf('.m3u8') !== -1 || (item.mime_type || '').indexOf('mpegurl') !== -1;
              var st = buildNuvioStream({
                url: item.url,
                provider: providerLabel || 'Filemoon',
                hoster: 'Filemoon',
                title: customTitle || data.title || '',
                height: h,
                language: languageLabel,
                isHls: isHls,
                headers: { Referer: u.origin + '/', Origin: u.origin, 'User-Agent': UA }
              });
              if (st) out.push(st);
            }
            if (out.length > 0) return out;
          }
        }
      }
    }
    return await extractPackerHoster(url, providerLabel, customTitle, 'Filemoon', languageLabel);
  } catch (_) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 8. Unified Embed Resolver
// ---------------------------------------------------------------------------

async function resolveAnyEmbed(rawUrl, providerLabel, customTitle, meta, languageLabel) {
  var url = normalizeHttpUrl(rawUrl);
  if (!url || !/^https?:\/\//i.test(url) || isDownloadOnlyHost(url)) return [];

  var lower = url.toLowerCase();

  if (lower.indexOf('videa.hu') !== -1 || lower.indexOf('videakid.hu') !== -1) {
    return await extractVideaStreams(url, providerLabel, customTitle, languageLabel);
  }
  if (lower.indexOf('indavideo.hu') !== -1) {
    return await extractIndavideoStreams(url, providerLabel, customTitle, languageLabel);
  }
  if (/rpmstream|rpmvid|rpmhub|rpmshare/.test(lower)) {
    return await extractRpmStream(url, 'https://hdmozi.hu/', providerLabel, customTitle, languageLabel);
  }
  if (/voe\.|voe-|shanelocaldog|walterprettytheir|yodelswart|launchreliant|diananatureforeign|susanexpectcare|jilliandeborah|reputationsicklyheavily|tupacpreston|cloudwindow|ugc-cdn|eunice|generousdiscipline|audaciouscarpenter/.test(lower)) {
    var voeStreams = await extractVoe(url, providerLabel, customTitle, languageLabel);
    if (voeStreams.length > 0) return voeStreams;
  }
  if (lower.indexOf('ok.ru') !== -1 || lower.indexOf('odnoklassniki.ru') !== -1) {
    return await extractOkRuStreams(url, providerLabel, customTitle, meta, languageLabel);
  }
  if (lower.indexOf('vidmoly') !== -1) {
    var vmStreams = await extractVidmoly(url, providerLabel, customTitle, languageLabel);
    if (vmStreams.length > 0) return vmStreams;
  }
  if (/rubystm\.|streamruby\.|nuvorel\.|rubyvid\./.test(lower)) {
    return await extractStreamRuby(url, providerLabel, customTitle, languageLabel);
  }
  if (lower.indexOf('vtbe.to') !== -1) {
    return await extractVtube(url, providerLabel, customTitle, languageLabel);
  }
  if (/luluvid\.|luluvdo\.|lulustream\./.test(lower)) {
    return await extractLuluvid(url, providerLabel, customTitle, languageLabel);
  }
  if (/mxdrop\.|mixdrop\./.test(lower)) {
    return await extractMixdrop(url, providerLabel, customTitle, languageLabel);
  }
  if (lower.indexOf('vidara') !== -1) {
    return await extractVidara(url, providerLabel, customTitle, languageLabel);
  }
  if (/bysesayeveum\.|byselapuix\.|bysetayico\.|byse\.|filemoon\./.test(lower)) {
    return await extractByse(url, providerLabel, customTitle, languageLabel);
  }
  if (/kerapoxy|streamwish|wishembed|vidoza|speedfiles|goodstream|supervideo/.test(lower)) {
    var u = safeParseUrl(url);
    var domain = u ? u.hostname.replace(/^www\./, '') : 'Hoster';
    return await extractPackerHoster(url, providerLabel, customTitle, domain, languageLabel);
  }
  if (/\.m3u8(\?|$)/i.test(lower)) {
    var mOrigin = getOrigin(url);
    var ms = buildNuvioStream({
      url: url,
      provider: providerLabel || 'Direct',
      hoster: 'HLS',
      title: customTitle,
      quality: '1080p',
      height: 1080,
      language: languageLabel,
      isHls: true,
      headers: mOrigin ? { Referer: mOrigin + '/', Origin: mOrigin, 'User-Agent': UA } : undefined
    });
    return ms ? [ms] : [];
  }
  if (/\.mp4(\?|$)/i.test(lower)) {
    var mpOrigin = getOrigin(url);
    var mps = buildNuvioStream({
      url: url,
      provider: providerLabel || 'Direct',
      hoster: 'MP4',
      title: customTitle,
      quality: '720p',
      height: 720,
      language: languageLabel,
      isHls: false,
      headers: mpOrigin ? { Referer: mpOrigin + '/', Origin: mpOrigin, 'User-Agent': UA } : undefined
    });
    return mps ? [mps] : [];
  }

  // Fallback: check if unknown mirror domain uses VOE embed format
  if (/^https?:\/\/[^/]+\/(?:[a-zA-Z0-9]{8,20}|e\/[a-zA-Z0-9]+|d\/[a-zA-Z0-9]+)\/?$/.test(url)) {
    var fallbackVoe = await extractVoe(url, providerLabel, customTitle, languageLabel);
    if (fallbackVoe.length > 0) return fallbackVoe;
  }

  return [];
}

module.exports = {
  DOWNLOAD_ONLY_HOSTS,
  isDownloadOnlyHost,
  inferHeight,
  buildNuvioStream,
  finalizeStreams,
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
  resolveAnyEmbed
};
