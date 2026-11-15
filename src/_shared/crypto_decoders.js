'use strict';

var CryptoJS = require('crypto-js');
var {
  base64ToBytes,
  bytesToUtf8,
  hexToBytes,
  utf8ToBytes
} = require('./bytes');

// ---------------------------------------------------------------------------
// 1. NetMozi LinkPayload Decoder (FNV-1a + xorshift32 v2 & v1) - pure JS
// ---------------------------------------------------------------------------

function _seed(value) {
  var state = 2166136261 >>> 0;
  for (var i = 0; i < value.length; i++) {
    state ^= value.charCodeAt(i);
    state = (state + (state << 1) + (state << 4) + (state << 7) + (state << 8) + (state << 24)) >>> 0;
  }
  return state >>> 0;
}

function _generator(state) {
  var s = state >>> 0;
  return function nxt() {
    s ^= (s << 13) >>> 0;
    s ^= s >>> 17;
    s ^= (s << 5) >>> 0;
    return s >>> 0;
  };
}

function unpackNetMoziPayload(value, token) {
  if (!value || typeof token !== 'string' || !token) return [];

  if (value.v === 2) {
    try {
      if (!value.s || !Array.isArray(value.d) || typeof value.m !== 'string') return [];
      var manifest = base64ToBytes(value.m);
      if (!manifest.length || manifest.length % 4) return [];

      var order = _generator(_seed(token + '|' + value.s + '|v2/positions') || 1);
      var encoded = '';
      for (var i = 0; i < manifest.length; i += 4) {
        var entry = (((manifest[i] << 24) | (manifest[i + 1] << 16) | (manifest[i + 2] << 8) | manifest[i + 3])) >>> 0;
        var position = (entry ^ order()) >>> 0;
        var bin = position % 4;
        var index = Math.floor(position / 4);
        if (!Array.isArray(value.d[bin]) || typeof value.d[bin][index] !== 'string') return [];
        encoded += value.d[bin][index];
      }

      var state = _seed('v2|' + value.s + '|' + token) || 1;
      var previous = state & 255;
      var bytes = base64ToBytes(encoded);
      var next = _generator(state);
      var plain = new Uint8Array(bytes.length);
      for (var j = 0; j < bytes.length; j++) {
        var cipher = bytes[j];
        plain[j] = ((cipher ^ (next() & 255)) - previous - (j % 251)) & 255;
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
      var orderV1 = _generator(_seed(token + '|' + value.n + '|order') || 1);
      var encodedV1 = '';
      for (var k = 0; k < value.r.length; k++) {
        var pos = (Number(value.r[k]) ^ orderV1()) >>> 0;
        if (!Array.isArray(value.p[pos % 3]) || typeof value.p[pos % 3][Math.floor(pos / 3)] !== 'string') return [];
        encodedV1 += value.p[pos % 3][Math.floor(pos / 3)];
      }
      var raw = base64ToBytes(encodedV1);
      var nxt = _generator(_seed(token + '|' + value.n) || 1);
      var out = new Uint8Array(raw.length);
      for (var m = 0; m < raw.length; m++) {
        out[m] = raw[m] ^ (nxt() & 255);
      }
      var parsed = JSON.parse(bytesToUtf8(out));
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (_) {
      return [];
    }
  }

  return [];
}

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveNetMoziContent(html) {
  if (!html || typeof html !== 'string') return '';
  for (var iter = 0; iter < 3; iter++) {
    if (html.indexOf('data-content-payload') === -1) break;
    var regex = /<script[^>]*data-content-payload[^>]*data-content-context="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g;
    var match;
    var replacedAny = false;
    while ((match = regex.exec(html)) !== null) {
      try {
        var context = match[1];
        var payload = JSON.parse(match[2]);
        var decodedArr = unpackNetMoziPayload(payload.value, context);
        var decoded = Array.isArray(decodedArr) ? decodedArr.join('') : String(decodedArr);
        if (payload.scope) {
          var scopeRegex = new RegExp('<div[^>]*data-content-scope="' + escapeRegExp(payload.scope) + '"[^>]*>[\\s\\S]*?<\\/div>');
          html = html.replace(scopeRegex, decoded);
        }
        html = html.replace(match[0], '');
        replacedAny = true;
      } catch (_) {}
    }
    if (!replacedAny) break;
  }
  return html;
}

// ---------------------------------------------------------------------------
// 2. Dean Edwards Packer & Hunter JS Obfuscation Decoders
// ---------------------------------------------------------------------------

function decodePackedArgs(p, a, c, k) {
  if (!p || !a || !c || c <= 0 || !Array.isArray(k)) return null;
  var encodeBase = function (num) {
    var first = num < a ? '' : encodeBase(Math.floor(num / a));
    var rem = num % a;
    var ch = rem > 35 ? String.fromCharCode(rem + 29) : rem.toString(36);
    return first + ch;
  };
  var out = p;
  while (c--) {
    if (k[c]) {
      (function (val) {
        out = out.replace(new RegExp('\\b' + encodeBase(c) + '\\b', 'g'), function () {
          return val;
        });
      })(k[c]);
    }
  }
  return out;
}

function unpackPacker(str) {
  var m = String(str || '').match(/}\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\((['"])\|\7\)/);
  if (!m) return null;
  return decodePackedArgs(m[2], parseInt(m[3], 10), parseInt(m[4], 10), m[6].split('|'));
}

function generalUnpack(html) {
  var results = [];
  if (!html || typeof html !== 'string') return results;
  var re = /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\((['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\((['"])\|\7\)/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var unpacked = decodePackedArgs(m[2], parseInt(m[3], 10), parseInt(m[4], 10), m[6].split('|'));
    if (unpacked) results.push(unpacked);
  }
  return results;
}

function decodeHunter(h, u, n, t, e) {
  try {
    var sep = n.charAt(e);
    var parts = String(h || '').split(sep);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part) continue;
      var val = 0;
      for (var j = 0; j < part.length; j++) {
        var idx = n.indexOf(part.charAt(j));
        if (idx !== -1) val = val * e + idx;
      }
      out.push((val - t) & 255);
    }
    return bytesToUtf8(new Uint8Array(out));
  } catch (_) {
    return '';
  }
}

// ---------------------------------------------------------------------------
// 3. VOE 5-Stage Payload Decoder
// ---------------------------------------------------------------------------

function decodeVoePayload(encoded) {
  try {
    var rot13 = String(encoded || '').replace(/[a-zA-Z]/g, function (c) {
      var base = c <= 'Z' ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
    var cleaned = rot13.replace(/(@\$|\^\^|~@|%\?|\*~|!!|#&)/g, '');
    var step3 = bytesToUtf8(base64ToBytes(cleaned));
    var step4 = '';
    for (var i = 0; i < step3.length; i++) {
      step4 += String.fromCharCode(step3.charCodeAt(i) - 3);
    }
    var reversed = step4.split('').reverse().join('');
    var jsonStr = bytesToUtf8(base64ToBytes(reversed));
    return JSON.parse(jsonStr);
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 4. CryptoJS WordArray <-> Uint8Array + Pure-JS AES-CBC / AES-256-GCM
// ---------------------------------------------------------------------------

function bytesToWordArray(bytes) {
  var words = [];
  for (var i = 0; i < bytes.length; i++) {
    words[i >>> 2] = (words[i >>> 2] || 0) | ((bytes[i] & 255) << (24 - (i % 4) * 8));
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function wordArrayToBytes(wa) {
  var words = wa.words;
  var sigBytes = wa.sigBytes;
  var out = new Uint8Array(sigBytes);
  for (var i = 0; i < sigBytes; i++) {
    out[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 255;
  }
  return out;
}

var RPM_KEY_HEX = '6b69656d7469656e6d75613931316361';
var RPM_IV_BYTES_PRIMARY = utf8ToBytes('1234567890oiuytr');
var RPM_IV_BYTES_ALT = utf8ToBytes('123456789oiuytr\0');

function decryptRpmHex(hexCipher) {
  var clean = String(hexCipher || '').trim();
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
        if (txt.charAt(0) === '{') {
          return JSON.parse(txt);
        }
      }
    } catch (_) {}
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
      if ((x[i] >>> b) & 1) {
        for (var k = 0; k < 16; k++) z[k] ^= v[k];
      }
      var lsb = v[15] & 1;
      for (var s = 15; s > 0; s--) {
        v[s] = (v[s] >>> 1) | ((v[s - 1] & 1) << 7);
      }
      v[0] = v[0] >>> 1;
      if (lsb) v[0] ^= 0xe1;
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
  // Length block: 64-bit bitlen(AAD=0) || 64-bit bitlen(C)
  var lenBlock = new Uint8Array(16);
  var bitLen = ciphertext.length * 8;
  var hi = Math.floor(bitLen / 0x100000000);
  var lo = bitLen >>> 0;
  lenBlock[8] = (hi >>> 24) & 255;
  lenBlock[9] = (hi >>> 16) & 255;
  lenBlock[10] = (hi >>> 8) & 255;
  lenBlock[11] = hi & 255;
  lenBlock[12] = (lo >>> 24) & 255;
  lenBlock[13] = (lo >>> 16) & 255;
  lenBlock[14] = (lo >>> 8) & 255;
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
    diff |= (s[i] ^ tagMask[i]) ^ tag[i];
  }
  if (diff !== 0) return null;

  var cb = new Uint8Array(j0);
  var plain = new Uint8Array(ctLen);
  for (var off = 0; off < ctLen; off += 16) {
    // inc32(cb)
    for (var idx = 15; idx >= 12; idx--) {
      cb[idx] = (cb[idx] + 1) & 255;
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

async function decryptBysePlayback(playback, forcePureJs) {
  if (!playback || playback.algorithm !== 'AES-256-GCM') return null;
  if (!Array.isArray(playback.key_parts) || !playback.iv || !playback.payload) return null;

  var tryIndices = [];
  var v = parseInt(playback.version, 10);
  if (Number.isInteger(v) && v >= 1 && v <= playback.key_parts.length && (30 - v) < playback.key_parts.length) {
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

      if (!forcePureJs && typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle && typeof globalThis.crypto.subtle.decrypt === 'function') {
        try {
          var cryptoKey = await globalThis.crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
          var plainBuf = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv, tagLength: 128 }, cryptoKey, buf);
          return JSON.parse(bytesToUtf8(new Uint8Array(plainBuf)));
        } catch (_) {
          // Fall back to pure-JS AES-256-GCM if subtle rejects buffer shapes or fails
        }
      }

      var plainPure = aes256GcmDecryptPure(key, iv, buf);
      if (plainPure) {
        return JSON.parse(bytesToUtf8(plainPure));
      }
    } catch (_) {}
  }

  return null;
}

module.exports = {
  _seed,
  _generator,
  unpackNetMoziPayload,
  resolveNetMoziContent,
  unpackPacker,
  generalUnpack,
  decodeHunter,
  decodeVoePayload,
  decryptRpmHex,
  aes256GcmDecryptPure,
  decryptBysePlayback
};
