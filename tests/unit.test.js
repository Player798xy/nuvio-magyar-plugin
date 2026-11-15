'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var nodeCrypto = require('node:crypto');

var bytes = require('../src/_shared/bytes');
var decoders = require('../src/_shared/crypto_decoders');
var meta = require('../src/_shared/meta');
var hosters = require('../src/_shared/hosters');

// ---------------------------------------------------------------------------
// Reference encoders for synthetic unit test vectors
// ---------------------------------------------------------------------------

function encodeNetMoziV2(routes, token, sSeed) {
  var next = decoders._generator(decoders._seed('v2|' + sSeed + '|' + token) || 1);
  var previous = (decoders._seed('v2|' + sSeed + '|' + token) || 1) & 255;
  var plain = Buffer.from(JSON.stringify(routes), 'utf8');
  var encBytes = Buffer.alloc(plain.length);

  for (var i = 0; i < plain.length; i++) {
    var k = next() & 255;
    var cipher = ((plain[i] + previous + (i % 251)) & 255) ^ k;
    encBytes[i] = cipher;
    previous = cipher;
  }

  var encodedB64 = encBytes.toString('base64');
  // Split into chunks across 4 bins
  var chunks = [];
  for (var c = 0; c < encodedB64.length; c += 3) {
    chunks.push(encodedB64.slice(c, c + 3));
  }

  var bins = [[], [], [], []];
  var positions = [];
  for (var p = 0; p < chunks.length; p++) {
    var bin = p % 4;
    var idx = bins[bin].length;
    bins[bin].push(chunks[p]);
    positions.push(idx * 4 + bin);
  }

  var order = decoders._generator(decoders._seed(token + '|' + sSeed + '|v2/positions') || 1);
  var manifest = Buffer.alloc(positions.length * 4);
  for (var m = 0; m < positions.length; m++) {
    var entry = (positions[m] ^ order()) >>> 0;
    manifest.writeUInt32BE(entry, m * 4);
  }

  return { v: 2, s: sSeed, d: bins, m: manifest.toString('base64') };
}

function encodeNetMoziV1(routes, token, nSeed) {
  var plain = Buffer.from(JSON.stringify(routes), 'utf8');
  var nxt = decoders._generator(decoders._seed(token + '|' + nSeed) || 1);
  var cipher = Buffer.alloc(plain.length);
  for (var i = 0; i < plain.length; i++) {
    cipher[i] = plain[i] ^ (nxt() & 255);
  }
  var b64 = cipher.toString('base64');
  var p = [[], [], []];
  var r = [];
  var order = decoders._generator(decoders._seed(token + '|' + nSeed + '|order') || 1);
  for (var c = 0, step = 0; c < b64.length; c += 4, step++) {
    var bin = step % 3;
    var idx = p[bin].length;
    p[bin].push(b64.slice(c, c + 4));
    r.push(((idx * 3 + bin) ^ order()) >>> 0);
  }
  return { n: nSeed, p: p, r: r };
}

function encodeVoePayload(obj) {
  var step6 = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
  var step5 = step6.split('').reverse().join('');
  var step4 = '';
  for (var i = 0; i < step5.length; i++) {
    step4 += String.fromCharCode(step5.charCodeAt(i) + 3);
  }
  var step3 = Buffer.from(step4, 'utf8').toString('base64');
  // Insert noise markers stripped by decodeVoePayload
  var withNoise = step3.slice(0, 4) + '@$' + step3.slice(4, 9) + '^^' + step3.slice(9);
  return withNoise.replace(/[a-zA-Z]/g, function (ch) {
    var base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function encodeHunter(str, u, n, t, e) {
  var sep = n.charAt(e);
  var out = '';
  for (var i = 0; i < str.length; i++) {
    var val = str.charCodeAt(i) + t;
    var digits = '';
    do {
      digits = n.charAt(val % e) + digits;
      val = Math.floor(val / e);
    } while (val > 0);
    out += digits + sep;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Bytes & URL Fallback Tests
// ---------------------------------------------------------------------------

test('bytes: Base64, Base64URL, Hex, UTF-8 roundtrips', function () {
  var sample = 'Árvíztűrő tükörfúrógép — Magyar Szinkron 1080p!';
  var utf8 = bytes.utf8ToBytes(sample);
  var b64 = bytes.bytesToBase64(utf8);
  var decoded = bytes.bytesToUtf8(bytes.base64ToBytes(b64));
  assert.equal(decoded, sample);

  // Base64URL without padding containing '-' and '_'
  var raw = new Uint8Array([251, 239, 190, 255, 192]);
  var b64Url = bytes.bytesToBase64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.deepEqual(bytes.base64ToBytes(b64Url), raw);

  var hex = bytes.bytesToHex(raw);
  assert.equal(hex, 'fbefbeffc0');
  assert.deepEqual(bytes.hexToBytes(hex), raw);
});

test('bytes: RC4 encryption & UTF-8 decryption roundtrip', function () {
  var key = 'testVideaKey998877';
  var plain = 'https://cdn.example.hu/video/stream_1080p.mp4?md5=abc';
  var plainBytes = bytes.utf8ToBytes(plain);

  var s = [];
  for (var i = 0; i < 256; i++) s[i] = i;
  var j = 0;
  var keyBytes = bytes.utf8ToBytes(key);
  for (var k = 0; k < 256; k++) {
    j = (j + s[k] + keyBytes[k % keyBytes.length]) % 256;
    var tmp = s[k]; s[k] = s[j]; s[j] = tmp;
  }
  var a = 0; var b = 0;
  var cipher = new Uint8Array(plainBytes.length);
  for (var x = 0; x < plainBytes.length; x++) {
    a = (a + 1) % 256;
    b = (b + s[a]) % 256;
    var t = s[a]; s[a] = s[b]; s[b] = t;
    cipher[x] = plainBytes[x] ^ s[(s[a] + s[b]) % 256];
  }

  assert.equal(bytes.rc4DecryptBytesToUtf8(cipher, key), plain);
});

test('bytes: safeParseUrl and normalizeHttpUrl work even without global URL constructor', function () {
  var OrigURL = globalThis.URL;
  try {
    globalThis.URL = undefined;
    assert.equal(
      bytes.normalizeHttpUrl('//cdn.example.com/a/b.m3u8?x=1&amp;y=2'),
      'https://cdn.example.com/a/b.m3u8?x=1&y=2'
    );
    assert.equal(
      bytes.normalizeHttpUrl('/links/go/123', 'https://mindjart.megnezed.com/links/vv/abc'),
      'https://mindjart.megnezed.com/links/go/123'
    );
    var parsed = bytes.safeParseUrl('https://sub.hoster.to:8443/embed/xyz?k=1#frag');
    assert.ok(parsed);
    assert.equal(parsed.origin, 'https://sub.hoster.to:8443');
    assert.equal(parsed.hostname, 'sub.hoster.to');
    assert.equal(parsed.pathname, '/embed/xyz');
  } finally {
    globalThis.URL = OrigURL;
  }
});

// ---------------------------------------------------------------------------
// 2. Crypto Decoder Tests
// ---------------------------------------------------------------------------

test('crypto_decoders: NetMozi v1 and v2 payload unpacking', function () {
  var routes = ['/links/route/alpha', '/links/route/beta'];
  var token = 'csrf-token-test-123';

  var payloadV2 = encodeNetMoziV2(routes, token, 'seedV2');
  assert.deepEqual(decoders.unpackNetMoziPayload(payloadV2, token), routes);

  var payloadV1 = encodeNetMoziV1(routes, token, 'seedV1');
  assert.deepEqual(decoders.unpackNetMoziPayload(payloadV1, token), routes);

  // Wrong token should fail cleanly and return []
  assert.deepEqual(decoders.unpackNetMoziPayload(payloadV2, 'wrong-token'), []);
});

test('crypto_decoders: VOE 5-stage payload decoder', function () {
  var input = { source: 'https://edge.voecdn.net/hls/master.m3u8', direct_access_url: 'https://edge.voecdn.net/video.mp4' };
  var encoded = encodeVoePayload(input);
  var decoded = decoders.decodeVoePayload(encoded);
  assert.deepEqual(decoded, input);
});

test('crypto_decoders: RPM AES-128-CBC hex decryption (both IV variants)', function () {
  var key = Buffer.from('kiemtienmua911ca', 'utf8');
  var sampleObj = { source: 'https://cdn.rpmshare.live/hls/master.m3u8?t=1', title: 'A Keresztapa' };
  var plainJson = JSON.stringify(sampleObj);

  // Primary IV: '1234567890oiuytr'
  var c1 = nodeCrypto.createCipheriv('aes-128-cbc', key, Buffer.from('1234567890oiuytr', 'utf8'));
  var hex1 = Buffer.concat([c1.update(plainJson, 'utf8'), c1.final()]).toString('hex');
  assert.deepEqual(decoders.decryptRpmHex(hex1), sampleObj);

  // Alternate IV: '123456789oiuytr\0'
  var c2 = nodeCrypto.createCipheriv('aes-128-cbc', key, Buffer.from('123456789oiuytr\0', 'utf8'));
  var hex2 = Buffer.concat([c2.update(plainJson, 'utf8'), c2.final()]).toString('hex');
  assert.deepEqual(decoders.decryptRpmHex(hex2), sampleObj);
});

test('crypto_decoders: Byse AES-256-GCM decryption (WebCrypto AND pure-JS GHASH/GCTR fallback)', async function () {
  var key = nodeCrypto.randomBytes(32);
  var iv = nodeCrypto.randomBytes(12);
  var expected = {
    sources: [
      { url: 'https://byse.cdn.example/master_1080.m3u8?token=$&1', quality: '1080p' }
    ]
  };

  var cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv);
  var encrypted = Buffer.concat([cipher.update(JSON.stringify(expected), 'utf8'), cipher.final()]);
  var authTag = cipher.getAuthTag();
  var payloadWithTag = Buffer.concat([encrypted, authTag]);

  var keyParts = new Array(32).fill(Buffer.alloc(16).toString('base64'));
  var version = 5;
  keyParts[version - 1] = key.subarray(0, 16).toString('base64');
  keyParts[30 - version] = key.subarray(16, 32).toString('base64');

  var playback = {
    algorithm: 'AES-256-GCM',
    version: version,
    key_parts: keyParts,
    iv: iv.toString('base64'),
    payload: payloadWithTag.toString('base64')
  };

  var resWebCrypto = await decoders.decryptBysePlayback(playback, false);
  assert.deepEqual(resWebCrypto, expected);

  var resPureJs = await decoders.decryptBysePlayback(playback, true);
  assert.deepEqual(resPureJs, expected);

  // Tampered auth tag must fail authentication in pure-JS fallback
  var tampered = new Uint8Array(payloadWithTag);
  tampered[tampered.length - 1] ^= 0xff;
  var tamperedPlayback = Object.assign({}, playback, {
    payload: bytes.bytesToBase64(tampered)
  });
  assert.equal(await decoders.decryptBysePlayback(tamperedPlayback, true), null);
});

test('crypto_decoders: Hunter & P.A.C.K.E.R unpackers (with special $ tokens)', function () {
  var targetStr = 'https://sorozatok.net/videoplayback.php?hash=Abc$1$$2Z';
  var dict = '0123456789abcdefghijk';
  var encoded = encodeHunter(targetStr, 0, dict, 23, 5);
  assert.equal(decoders.decodeHunter(encoded, 0, dict, 23, 5), targetStr);

  // P.A.C.K.E.R test containing literal "$1" and "$$" tokens inside word list
  var packerSnippet = "eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0=\"1\";',2,2,'var|ok$1$$2'.split('|'),0,{}))";
  var unpacked = decoders.generalUnpack(packerSnippet);
  assert.ok(unpacked.indexOf('var="ok$1$$2";') !== -1);
});

// ---------------------------------------------------------------------------
// 3. Metadata, Title, Runtime & Episode Matching Tests
// ---------------------------------------------------------------------------

test('meta: normalizeTitle, isTitleMatch, sequel & remake collision guards', function () {
  assert.equal(meta.normalizeTitle('A Nagy Hő-Hő-Horgász (1982)!'), 'a nagy ho ho horgasz 1982');

  // Sequel / numbered protection
  assert.equal(meta.isTitleMatch('Vuk', 'Vuk teljes mese 1981', 1981, false), true);
  assert.equal(meta.isTitleMatch('Vuk', 'Kis Vuk 2', 1981, false), false);
  assert.equal(meta.isTitleMatch('Mátrix', 'Mátrix újratöltve', 1999, false), false);
  assert.equal(meta.isTitleMatch('Mátrix', 'Mátrix (1999) HD', 1999, false), true);

  // Wrong year remake rejection
  assert.equal(meta.isTitleMatch('Dűne', 'Dűne (1984)', 2021, false), false);
  assert.equal(meta.isTitleMatch('Dűne', 'Dűne (2021)', 2021, false), true);

  // Short ambiguous title needs movie cue or year
  assert.equal(meta.isTitleMatch('F1', 'F1 highlights race vlog', 2025, false), false);
  assert.equal(meta.isTitleMatch('F1', 'F1 2025 teljes film magyarul', 2025, false), true);
});

test('meta: PAL runtime validation & page metadata verification', function () {
  // Movie is 120 min (7200s); 25fps PAL speedup is ~6912s -> valid; 90s trailer -> rejected
  assert.equal(meta.isValidRuntime(6912, { type: 'movie', runtimeMinutes: 120 }), true);
  assert.equal(meta.isValidRuntime(90, { type: 'movie', runtimeMinutes: 120 }), false);

  // IMDb mismatch overrides year
  var wrongImdbHtml = '<html><body><span>2021</span><a href="https://imdb.com/title/tt9999999">IMDb</a></body></html>';
  assert.equal(meta.checkPageMetadata(wrongImdbHtml, { type: 'movie', year: 2021, imdbId: 'tt1160419' }).match, false);

  var okImdbHtml = '<html><body><a href="https://imdb.com/title/tt1160419">IMDb</a></body></html>';
  assert.equal(meta.checkPageMetadata(okImdbHtml, { type: 'movie', year: 2021, imdbId: 'tt1160419' }).match, true);
});

test('meta: matchesEpisode parses SxxExx, NxM, and Hungarian season/episode patterns', function () {
  assert.equal(meta.matchesEpisode('Trónok harca S02E05', 2, 5, ''), true);
  assert.equal(meta.matchesEpisode('Trónok harca S02E06', 2, 5, ''), false);
  assert.equal(meta.matchesEpisode('A Tenkes kapitánya 2. évad 3. rész', 2, 3, ''), true);
  assert.equal(meta.matchesEpisode('A Tenkes kapitánya 3. rész', 1, 3, ''), true);
  assert.equal(meta.matchesEpisode('A Tenkes kapitánya 4. rész', 1, 3, ''), false);
});

// ---------------------------------------------------------------------------
// 4. Stream Finalization & Security Filtering Tests
// ---------------------------------------------------------------------------

test('hosters: finalizeStreams strips spoofing headers, deduplicates, and sorts Hungarian > Resolution > HLS', function () {
  var s1 = hosters.buildNuvioStream({
    url: 'https://cdn.example.com/movie_720.mp4',
    provider: 'NetMozi',
    hoster: 'Videa',
    title: 'Teszt',
    quality: '720p',
    height: 720,
    language: 'Magyar Felirat',
    isHls: false,
    headers: {
      'Referer': 'https://videa.hu/',
      'X-Forwarded-For': '185.112.156.1',
      'Client-IP': '1.2.3.4'
    }
  });
  var s2 = hosters.buildNuvioStream({
    url: 'https://cdn.example.com/movie_1080.m3u8',
    provider: 'HDMozi',
    hoster: 'RPM',
    title: 'Teszt',
    quality: '1080p',
    height: 1080,
    language: 'Magyar Szinkron',
    isHls: true
  });
  var s3Dup = hosters.buildNuvioStream({
    url: 'https://cdn.example.com/movie_1080.m3u8',
    provider: 'HDMozi',
    hoster: 'RPM',
    title: 'Teszt',
    quality: '1080p',
    height: 1080,
    language: 'Magyar Szinkron',
    isHls: true
  });

  var out = hosters.finalizeStreams([s1, s2, s3Dup]);
  assert.equal(out.length, 2);
  assert.equal(out[0].type, 'hls');
  assert.equal(out[0].quality, '1080p');
  assert.equal(out[0].language, 'Magyar Szinkron');
  assert.equal(out[1].headers['X-Forwarded-For'], undefined);
  assert.equal(out[1].headers['Client-IP'], undefined);
  assert.equal(out[1].headers['Referer'], 'https://videa.hu/');
});

test('hosters: finalizeStreams collapses same-upload qualities, drops low-res clutter when HD exists, and sorts strictly', function () {
  var streams = [
    hosters.buildNuvioStream({
      url: 'https://videa.hu/static/240p/8.999999.111111.1.0.1.1?md5=aaa&expires=999',
      provider: 'Filmvilág2',
      hoster: 'Videa',
      quality: '240p',
      height: 240,
      language: 'Magyar Szinkron',
      isHls: false
    }),
    hosters.buildNuvioStream({
      url: 'https://videa.hu/static/360p/8.123456.789012.1.0.1.1?md5=bbb&expires=999',
      provider: 'Videa.hu',
      hoster: 'Videa',
      quality: '360p',
      height: 360,
      language: 'Magyar Szinkron',
      isHls: false
    }),
    hosters.buildNuvioStream({
      url: 'https://videa.hu/static/w1080p/8.123456.789012.1.0.1.1?md5=ccc&expires=888',
      provider: 'JobbMintATV',
      hoster: 'Videa',
      quality: '1080p',
      height: 1080,
      language: 'Magyar Szinkron',
      isHls: false
    }),
    hosters.buildNuvioStream({
      url: 'https://cdn.example.hu/movie_480.mp4',
      provider: 'Indavideo',
      hoster: 'Indavideo',
      quality: '480p',
      height: 480,
      language: 'Magyar Szinkron',
      isHls: false
    }),
    hosters.buildNuvioStream({
      url: 'https://cdn.example.hu/movie_eng_1080.m3u8',
      provider: 'NetMozi',
      hoster: 'VOE',
      quality: '1080p',
      height: 1080,
      language: 'Külföldi (ENG)',
      isHls: true
    }),
    hosters.buildNuvioStream({
      url: 'https://cdn.example.hu/movie_720.m3u8',
      provider: 'DMDAMedia',
      hoster: 'Vidara',
      quality: '720p',
      height: 720,
      language: 'Magyar Szinkron',
      isHls: true
    }),
    hosters.buildNuvioStream({
      url: 'https://cdn.example.hu/movie_1080.m3u8',
      provider: 'OnlineFilmek',
      hoster: 'VOE',
      quality: '1080p',
      height: 1080,
      language: 'Magyar Szinkron',
      isHls: true
    })
  ];

  var out = hosters.finalizeStreams(streams, { maxStreams: 10 });
  // Only 1080p HLS, 1080p MP4 (360p of same Videa upload collapsed), and 720p HLS survive;
  // 240p, 480p and ENG are dropped when Magyar Szinkron HD exists!
  assert.equal(out.length, 3);
  assert.equal(out[0].quality, '1080p');
  assert.equal(out[0].type, 'hls');
  assert.equal(out[1].quality, '1080p');
  assert.equal(out[1].type, 'mp4');
  assert.equal(out[2].quality, '720p');
  assert.equal(out[2].type, 'hls');
  assert.ok(out[0].name.indexOf('1080p HLS') !== -1);
});
