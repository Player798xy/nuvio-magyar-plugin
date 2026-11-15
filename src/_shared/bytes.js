'use strict';

var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
var B64_LOOKUP = (function () {
  var table = new Int16Array(256);
  for (var i = 0; i < 256; i++) table[i] = -1;
  for (var j = 0; j < B64_CHARS.length; j++) {
    table[B64_CHARS.charCodeAt(j)] = j;
  }
  return table;
})();

function base64ToBytes(str) {
  var clean = String(str || '').replace(/[\r\n\s]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!clean) return new Uint8Array(0);
  while (clean.length % 4 !== 0) clean += '=';
  var len = clean.length;
  var pad = 0;
  if (clean.charAt(len - 1) === '=') pad++;
  if (clean.charAt(len - 2) === '=') pad++;
  var outLen = (len / 4) * 3 - pad;
  var out = new Uint8Array(outLen);
  var p = 0;
  for (var i = 0; i < len; i += 4) {
    var a = B64_LOOKUP[clean.charCodeAt(i) & 255];
    var b = B64_LOOKUP[clean.charCodeAt(i + 1) & 255];
    var c = clean.charAt(i + 2) === '=' ? 0 : B64_LOOKUP[clean.charCodeAt(i + 2) & 255];
    var d = clean.charAt(i + 3) === '=' ? 0 : B64_LOOKUP[clean.charCodeAt(i + 3) & 255];
    if (a < 0 || b < 0 || c < 0 || d < 0) {
      throw new Error('Invalid base64 character');
    }
    var n = (a << 18) | (b << 12) | (c << 6) | d;
    if (p < outLen) out[p++] = (n >>> 16) & 255;
    if (p < outLen) out[p++] = (n >>> 8) & 255;
    if (p < outLen) out[p++] = n & 255;
  }
  return out;
}

function bytesToBase64(bytes) {
  if (!bytes || !bytes.length) return '';
  var out = '';
  var len = bytes.length;
  for (var i = 0; i < len; i += 3) {
    var b0 = bytes[i];
    var b1 = i + 1 < len ? bytes[i + 1] : 0;
    var b2 = i + 2 < len ? bytes[i + 2] : 0;
    var n = (b0 << 16) | (b1 << 8) | b2;
    out += B64_CHARS.charAt((n >>> 18) & 63);
    out += B64_CHARS.charAt((n >>> 12) & 63);
    out += i + 1 < len ? B64_CHARS.charAt((n >>> 6) & 63) : '=';
    out += i + 2 < len ? B64_CHARS.charAt(n & 63) : '=';
  }
  return out;
}

function stringToBase64(str) {
  return bytesToBase64(utf8ToBytes(str));
}

function hexToBytes(hex) {
  var clean = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
  var len = clean.length >> 1;
  var out = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16) & 255;
  }
  return out;
}

function bytesToHex(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var h = (bytes[i] & 255).toString(16);
    out += h.length === 1 ? '0' + h : h;
  }
  return out;
}

function utf8ToBytes(str) {
  var s = String(str || '');
  var bytes = [];
  for (var i = 0; i < s.length; i++) {
    var code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      var low = s.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >>> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >>> 12), 0x80 | ((code >>> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >>> 18),
        0x80 | ((code >>> 12) & 0x3f),
        0x80 | ((code >>> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return new Uint8Array(bytes);
}

function bytesToUtf8(bytes) {
  if (!bytes || !bytes.length) return '';
  var out = '';
  var i = 0;
  var len = bytes.length;
  while (i < len) {
    var b0 = bytes[i++];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
    } else if ((b0 & 0xe0) === 0xc0 && i < len) {
      var b1 = bytes[i++] & 0x3f;
      out += String.fromCharCode(((b0 & 0x1f) << 6) | b1);
    } else if ((b0 & 0xf0) === 0xe0 && i + 1 < len) {
      var b1e = bytes[i++] & 0x3f;
      var b2e = bytes[i++] & 0x3f;
      out += String.fromCharCode(((b0 & 0x0f) << 12) | (b1e << 6) | b2e);
    } else if ((b0 & 0xf8) === 0xf0 && i + 2 < len) {
      var b1f = bytes[i++] & 0x3f;
      var b2f = bytes[i++] & 0x3f;
      var b3f = bytes[i++] & 0x3f;
      var cp = ((b0 & 0x07) << 18) | (b1f << 12) | (b2f << 6) | b3f;
      if (cp <= 0xffff) {
        out += String.fromCharCode(cp);
      } else {
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >>> 10), 0xdc00 + (cp & 0x3ff));
      }
    } else {
      out += '\ufffd';
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

function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, function (_, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    })
    .replace(/&#(\d+);/g, function (_, dec) {
      return String.fromCharCode(parseInt(dec, 10));
    });
}

function normalizeHttpUrl(rawUrl, baseUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  var s = decodeHtmlEntities(rawUrl).trim();
  if (!s) return '';
  if (s.indexOf('//') === 0) return 'https:' + s;
  if (/^https?:\/\//i.test(s)) return s;
  if (baseUrl) {
    if (typeof URL === 'function') {
      try {
        return new URL(s, baseUrl).href;
      } catch (_) {}
    }
    var m = String(baseUrl).match(/^(https?:\/\/[^/?#]+)(\/[^?#]*)?/i);
    if (m) {
      if (s.charAt(0) === '/') return m[1] + s;
      if (s.charAt(0) === '?' || s.charAt(0) === '#') return m[1] + (m[2] || '/') + s;
      var baseDir = (m[2] || '/').replace(/\/[^/]*$/, '/');
      return m[1] + baseDir + s;
    }
  }
  return s;
}

function safeParseUrl(rawUrl, baseUrl) {
  var normalized = normalizeHttpUrl(rawUrl, baseUrl);
  if (!normalized) return null;
  if (typeof URL === 'function') {
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
  var colonIdx = host.indexOf(':');
  var hostname = colonIdx !== -1 ? host.slice(0, colonIdx) : host;
  return {
    href: normalized,
    protocol: protocol,
    host: host,
    hostname: hostname,
    origin: protocol + '//' + host,
    pathname: m[3] || '/',
    search: m[4] || '',
    hash: m[5] || ''
  };
}

module.exports = {
  base64ToBytes,
  bytesToBase64,
  stringToBase64,
  hexToBytes,
  bytesToHex,
  utf8ToBytes,
  bytesToUtf8,
  rc4DecryptBytesToUtf8,
  decodeHtmlEntities,
  normalizeHttpUrl,
  safeParseUrl
};
