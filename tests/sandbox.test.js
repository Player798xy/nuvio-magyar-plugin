'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var nodeCrypto = require('node:crypto');

var cheerio = require('cheerio-without-node-native');
var CryptoJS = require('crypto-js');
var bytes = require('../src/_shared/bytes');
var decoders = require('../src/_shared/crypto_decoders');

var ROOT = path.resolve(__dirname, '..');
var MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Synthetic Hoster Fixture Builders
// ---------------------------------------------------------------------------

var TEST_VIDEA_CODE = 'AbCdEf1234567890';
var TEST_INDA_HASH = 'a1b2c3d4e5';
var TEST_RPM_ID = 'rpmTest999';

function buildVideaMockResponses(baseUrl) {
  var _xt = 'xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJ'.slice(0, 32);
  var _s = 'B'.repeat(8);
  var _t = 'C'.repeat(8);
  var xmlPlain = '<?xml version="1.0"?><videa_video>' +
    '<video>' +
    '<title><![CDATA[A Keresztapa (1972) teljes film]]></title>' +
    '<duration>10500</duration>' +
    '</video>' +
    '<video_sources>' +
    '<video_source name="hd" height="1080" exp="9999999999">//cdn.videa.hu/test/1080p.mp4</video_source>' +
    '<video_source name="sd" height="480" exp="9999999999">//cdn.videa.hu/test/480p.mp4</video_source>' +
    '</video_sources>' +
    '<hash_value_hd>hash1080</hash_value_hd>' +
    '<hash_value_sd>hash480</hash_value_sd>' +
    '</videa_video>';

  return {
    playerHtml: '<html><head></head><body><script>var _xt = "' + _xt + '";</script></body></html>',
    xmlBase64: Buffer.from(xmlPlain, 'utf8').toString('base64'),
    baseUrl: baseUrl,
    _s: _s,
    _t: _t
  };
}

function encryptRpmJson(obj) {
  var key = Buffer.from('kiemtienmua911ca', 'utf8');
  var iv = Buffer.from('1234567890oiuytr', 'utf8');
  var cipher = nodeCrypto.createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]).toString('hex');
}

function makeHunterGoPhp(vpUrl) {
  var dict = '0123456789abcdef';
  var e = 4;
  var t = 19;
  var sep = dict.charAt(e);
  var encoded = '';
  for (var i = 0; i < vpUrl.length; i++) {
    var val = vpUrl.charCodeAt(i) + t;
    var digits = '';
    do {
      digits = dict.charAt(val % e) + digits;
      val = Math.floor(val / e);
    } while (val > 0);
    encoded += digits + sep;
  }
  return '<script>eval(function(h,u,n,t,e,r){return decodeURIComponent(escape(r))}("' +
    encoded + '",0,"' + dict + '",' + t + ',' + e + ',1))</script>';
}

function createMockResponse(status, bodyText, url, headersMap) {
  var lowerHeaders = {};
  var raw = headersMap || {};
  for (var k in raw) {
    if (Object.prototype.hasOwnProperty.call(raw, k)) lowerHeaders[k.toLowerCase()] = raw[k];
  }
  return {
    ok: status >= 200 && status < 300,
    status: status,
    url: url,
    headers: {
      get: function (name) {
        return lowerHeaders[String(name || '').toLowerCase()] || '';
      }
    },
    text: async function () { return bodyText; },
    json: async function () { return JSON.parse(bodyText); }
  };
}

function createMockFetch(spyHeaders) {
  var vMock = buildVideaMockResponses('https://videa.hu');

  return async function mockFetch(url, options) {
    var reqUrl = String(url);
    var opts = options || {};
    spyHeaders.push({ url: reqUrl, headers: opts.headers || {} });

    // 1. TMDB API Mocks (Movie 238 Godfather + TV 1396 Breaking Bad)
    if (reqUrl.indexOf('api.themoviedb.org/3/movie/238/external_ids') !== -1) {
      return createMockResponse(200, JSON.stringify({ imdb_id: 'tt0068646' }), reqUrl);
    }
    if (reqUrl.indexOf('api.themoviedb.org/3/movie/238/translations') !== -1) {
      return createMockResponse(200, JSON.stringify({ translations: [{ iso_639_1: 'hu', data: { title: 'A Keresztapa' } }] }), reqUrl);
    }
    if (reqUrl.indexOf('api.themoviedb.org/3/movie/238') !== -1) {
      return createMockResponse(200, JSON.stringify({ id: 238, title: 'A Keresztapa', original_title: 'The Godfather', release_date: '1972-03-14', runtime: 175 }), reqUrl);
    }
    if (reqUrl.indexOf('api.themoviedb.org/3/tv/1396/external_ids') !== -1) {
      return createMockResponse(200, JSON.stringify({ imdb_id: 'tt0903747' }), reqUrl);
    }
    if (reqUrl.indexOf('api.themoviedb.org/3/tv/1396/season/1/episode/1') !== -1) {
      return createMockResponse(200, JSON.stringify({ name: 'Pilot', runtime: 58 }), reqUrl);
    }
    if (reqUrl.indexOf('api.themoviedb.org/3/tv/1396') !== -1) {
      return createMockResponse(200, JSON.stringify({ id: 1396, name: 'Totál szívás', original_name: 'Breaking Bad', first_air_date: '2008-01-20', episode_run_time: [47] }), reqUrl);
    }

    // 2. Shared Videa / Videakid Hoster Mocks (returns unencrypted XML so computeVideaParams random salt doesn't break mock)
    if (/https?:\/\/(videa|videakid)\.hu\/player\?/.test(reqUrl)) {
      return createMockResponse(200, vMock.playerHtml, reqUrl, { 'x-videa-xs': 'xsMock123' });
    }
    if (/https?:\/\/(videa|videakid)\.hu\/player\/xml/.test(reqUrl)) {
      return createMockResponse(200, '<?xml version="1.0"?><videa_video><video><title><![CDATA[A Keresztapa (1972) teljes film]]></title><duration>10500</duration></video><video_sources><video_source name="hd" height="1080" exp="9999999999">//cdn.videa.hu/test/1080p.mp4</video_source></video_sources><hash_value_hd>hash1080</hash_value_hd></videa_video>', reqUrl);
    }

    // 3. Indavideo Hoster & Search Mocks
    if (reqUrl.indexOf('amfphp.indavideo.hu/SYm0json.php') !== -1) {
      return createMockResponse(200, 'json(' + JSON.stringify({
        data: {
          title: 'A Keresztapa (1972) HD',
          length: 10400,
          date: '2018-05-01',
          flv_files: ['720', '360'],
          video_files: { 720: 'https://cdn.indavideo.hu/video/720.mp4', 360: 'https://cdn.indavideo.hu/video/360.mp4' },
          filesh: { 720: 'tok720', 360: 'tok360' }
        }
      }) + ')', reqUrl);
    }
    if (reqUrl.indexOf('indavideo.hu/search') !== -1) {
      return createMockResponse(200, '<a href="https://indavideo.hu/video/a_keresztapa_1972">A Keresztapa</a>', reqUrl);
    }
    if (reqUrl.indexOf('indavideo.hu/video/a_keresztapa_1972') !== -1) {
      return createMockResponse(200, '<input id="emb_hash" value="' + TEST_INDA_HASH + '" /><div>2018-05-01</div>', reqUrl);
    }

    // 4. Videa / Videakid Search Mocks
    if (reqUrl.indexOf('https://videa.hu/kereses/') === 0) {
      return createMockResponse(200, '<div class="video-card"><a href="/videok/film-animacio/a-keresztapa-' + TEST_VIDEA_CODE + '">A Keresztapa 1972</a></div>', reqUrl);
    }
    if (reqUrl.indexOf('https://videakid.hu/kereses/') === 0) {
      return createMockResponse(200, '<a href="https://videakid.hu/videok/a-keresztapa-' + TEST_VIDEA_CODE + '" title="A Keresztapa (1972)">A Keresztapa</a>', reqUrl);
    }

    // 5. NetMozi & Mindjart Mocks (including NetMozi v2 encrypted payload)
    if (reqUrl.indexOf('https://netmozi.com/search') === 0 || reqUrl.indexOf('https://netmozi.com/?search=') === 0) {
      return createMockResponse(200, '<article class="movie-card"><a href="/adatlap/55123"><h3 class="movie-title">A Keresztapa</h3></a><span>Év: 1972</span></article>', reqUrl);
    }
    if (reqUrl.indexOf('https://mindjart.megnezed.com/links/vv/') === 0) {
      var html = '<table><tr data-link-row><td><img src="videa.png" alt="Videa" /></td><td>Magyar Szinkron</td><td>' +
        '<script data-link-payload data-link-context="ctx123">{"value":' +
        JSON.stringify((function () {
          var s = 's1';
          var tok = 'ctx123';
          var plain = Buffer.from(JSON.stringify(['https://mindjart.megnezed.com/links/go/999']), 'utf8');
          var st = decoders._seed('v2|' + s + '|' + tok) || 1;
          var prev = st & 255;
          var nxt = decoders._generator(st);
          var enc = Buffer.alloc(plain.length);
          for (var i = 0; i < plain.length; i++) {
            var c = ((plain[i] + prev + (i % 251)) & 255) ^ (nxt() & 255);
            enc[i] = c; prev = c;
          }
          var b64 = enc.toString('base64');
          var ord = decoders._generator(decoders._seed(tok + '|' + s + '|v2/positions') || 1);
          var mf = Buffer.alloc(4);
          mf.writeUInt32BE((0 ^ ord()) >>> 0, 0);
          return { v: 2, s: s, d: [[b64], [], [], []], m: mf.toString('base64') };
        })()) +
        '}</script></td></tr></table>';
      return createMockResponse(200, html, reqUrl);
    }
    if (reqUrl.indexOf('https://mindjart.megnezed.com/links/go/999') === 0) {
      return createMockResponse(302, '', 'https://videa.hu/player?v=' + TEST_VIDEA_CODE, { location: 'https://videa.hu/player?v=' + TEST_VIDEA_CODE });
    }

    // 6. JobbMintATV Mocks (testing windows-1250 U+FFFD + ASCII slug resilience!)
    if (reqUrl.indexOf('https://jobbmintatv.org/ajax.php') === 0) {
      return createMockResponse(200, '<a href="//jobbmintatv.org/online/A_keresztapa_1972"><div>A Kereszt\ufffdpa (1972)</div></a>', reqUrl);
    }
    if (reqUrl.indexOf('https://jobbmintatv.org/online/A_keresztapa_1972') === 0) {
      return createMockResponse(200, '<a href="https://imdb.com/title/tt0068646">IMDb</a><iframe src="https://videa.hu/player?v=' + TEST_VIDEA_CODE + '"></iframe>', reqUrl);
    }

    // 7. Filmezek Mocks
    if (reqUrl.indexOf('https://filmezek.com/searchinput.php') === 0) {
      return createMockResponse(200, JSON.stringify([{ MovieTitle: 'A Keresztapa', MovieSlug: 'a-keresztapa', MovieYear: '1972', MovieCover: 'tt0068646.jpg', type: 'online-filmek' }]), reqUrl);
    }
    if (reqUrl.indexOf('https://filmezek.com/online-filmek/a-keresztapa/') === 0) {
      return createMockResponse(200, '<a href="https://imdb.com/title/tt0068646">IMDb</a><button data-url="https://videa.hu/player?v=' + TEST_VIDEA_CODE + '"></button>', reqUrl);
    }

    // 8. OnlineFilmek Mocks
    if (reqUrl.indexOf('onlinefilmekingyen1.com/wp-json/dooplay/search/') !== -1) {
      return createMockResponse(200, JSON.stringify({ '1': { title: 'A Keresztapa', url: 'https://www.onlinefilmekingyen1.com/movies/a-keresztapa/', extra: { date: '1972' } } }), reqUrl);
    }
    if (reqUrl.indexOf('onlinefilmekingyen1.com/movies/a-keresztapa/') !== -1) {
      return createMockResponse(200, '<span class="year">1972</span><li data-post="101" data-nume="1" data-type="movie"></li>', reqUrl);
    }
    if (reqUrl.indexOf('onlinefilmekingyen1.com/wp-json/dooplayer/v2/101/movie/1') !== -1) {
      return createMockResponse(200, JSON.stringify({ embed_url: 'https://videa.hu/player?v=' + TEST_VIDEA_CODE }), reqUrl);
    }

    // 9. HDMozi + RPM AES-128-CBC Mocks
    if (reqUrl.indexOf('https://hdmozi.hu/?s=') === 0) {
      return createMockResponse(200, '<div class="details"><div class="title"><a href="https://hdmozi.hu/movies/a-keresztapa/">A Keresztapa</a></div><span class="year">1972</span></div></div>', reqUrl);
    }
    if (reqUrl.indexOf('https://hdmozi.hu/movies/a-keresztapa/') === 0) {
      return createMockResponse(200, '<h1>A Keresztapa (1972)</h1><iframe src="https://rpmshare.rpmstream.live/#' + TEST_RPM_ID + '"></iframe>', reqUrl);
    }
    if (reqUrl.indexOf('rpmshare.rpmstream.live/api/v1/video?id=' + TEST_RPM_ID) !== -1) {
      return createMockResponse(200, encryptRpmJson({ source: 'https://cdn.rpmshare.live/a_keresztapa/master.m3u8', title: 'A Keresztapa' }), reqUrl);
    }

    // 10. DMDAMedia Mocks
    if (reqUrl === 'https://dmdamedia.hu/search') {
      return createMockResponse(200, '<a href="/a_keresztapa_film">Film 9.2 A Keresztapa 1972</a>', reqUrl);
    }
    if (reqUrl === 'https://dmdamedia.hu/a_keresztapa_film') {
      return createMockResponse(200, '<h1>A Keresztapa (1972)</h1><a href="?a=videa#lejatszo">Videa</a><iframe src="https://videa.hu/player?v=' + TEST_VIDEA_CODE + '"></iframe>', reqUrl);
    }

    // 11. Sorozatok.net Mocks (Hunter + videoplayback.php redirect)
    if (reqUrl === 'https://sorozatok.net/api/search.json') {
      return createMockResponse(200, JSON.stringify((function () {
        var arr = [{ cat_name: 'Totál szívás', cat_eng: 'Breaking Bad', url: 'total-szivas', year: '2008' }];
        for (var i = 0; i < 105; i++) arr.push({ cat_name: 'Filler ' + i, cat_eng: 'Filler ' + i, url: 'f' + i, year: '2020' });
        return arr;
      })()), reqUrl);
    }
    if (reqUrl === 'https://sorozatok.net/total-szivas-online') {
      return createMockResponse(200, '<a class="clip-link" href="/watch?v=epS01E01" data-id="777"><h4 class="video-title"><a href="/watch?v=epS01E01">1. évad 1. rész</a></h4></a>', reqUrl);
    }
    if (reqUrl.indexOf('https://sorozatok.net/go.php') === 0) {
      return createMockResponse(200, makeHunterGoPhp('https://sorozatok.net/videoplayback.php?hash=sbHash123'), reqUrl);
    }
    if (reqUrl === 'https://sorozatok.net/videoplayback.php?hash=sbHash123') {
      return createMockResponse(302, '', 'https://videa.hu/player?v=' + TEST_VIDEA_CODE, { location: 'https://videa.hu/player?v=' + TEST_VIDEA_CODE });
    }

    // 12. Filmvilág2 Mocks
    if (reqUrl === 'https://katalog.estranky.cz/') {
      return createMockResponse(200, '<a href="https://onlinefilmvilag2.eu/clanky/a-keresztapa-1972.html">A Keresztapa (HD)</a>', reqUrl);
    }
    if (reqUrl === 'https://onlinefilmvilag2.eu/clanky/a-keresztapa-1972.html') {
      return createMockResponse(200, '<title>A Keresztapa (1972)</title><iframe src="https://videa.hu/player?v=' + TEST_VIDEA_CODE + '"></iframe>', reqUrl);
    }

    // 13. MeseFilm (MeseKincstár) Mocks
    if (reqUrl.indexOf('https://mesekincstar.tv/mesekereso/') === 0) {
      return createMockResponse(200, '<a href="https://mesekincstar.tv/mesek/a-keresztapa-1972">A Keresztapa (1972)</a>', reqUrl);
    }
    if (reqUrl === 'https://mesekincstar.tv/mesek/a-keresztapa-1972') {
      return createMockResponse(200, '<h1>A Keresztapa (1972)</h1><iframe src="https://videa.hu/player?v=' + TEST_VIDEA_CODE + '"></iframe>', reqUrl);
    }

    // 14. MédiaKlikk Mocks
    if (reqUrl.indexOf('https://player.mediaklikk.hu/playernew/player.php') === 0) {
      return createMockResponse(200, '{"file": "https:\\/\\/stream.mediaklikk.hu\\/vod\\/sample\\/playlist.m3u8"}', reqUrl);
    }

    return createMockResponse(404, '', reqUrl);
  };
}

function assertValidStreams(streams, label, spyHeaders) {
  assert.ok(Array.isArray(streams), label + ' must return an array');
  assert.ok(streams.length > 0, label + ' should return at least 1 stream against mock fixture');

  for (var sIdx = 0; sIdx < streams.length; sIdx++) {
    var st = streams[sIdx];
    assert.ok(typeof st.name === 'string' && st.name.length > 0, label + ' stream missing name');
    assert.ok(typeof st.title === 'string' && st.title.length > 0, label + ' stream missing title');
    assert.ok(/^https?:\/\//.test(st.url), label + ' stream url invalid: ' + st.url);
    assert.ok(/\.(mp4|m3u8)(\?|$)/i.test(st.url) || st.url.indexOf('/1080p.mp4') !== -1 || st.url.indexOf('/720.mp4') !== -1, label + ' returned non-media URL: ' + st.url);
    assert.ok(st.type === 'mp4' || st.type === 'hls', label + ' stream type must be mp4/hls, got ' + st.type);
    assert.ok(typeof st.quality === 'string' && st.quality.length > 0, label + ' stream missing quality');
    assert.ok(typeof st.language === 'string' && st.language.length > 0, label + ' stream missing language');
    assert.ok(typeof st.provider === 'string' && st.provider.length > 0, label + ' stream missing provider');
  }

  for (var hIdx = 0; hIdx < spyHeaders.length; hIdx++) {
    var hdrs = spyHeaders[hIdx].headers || {};
    var keys = Object.keys(hdrs).map(function (k) { return k.toLowerCase(); });
    assert.equal(keys.indexOf('x-forwarded-for'), -1, label + ' sent forbidden X-Forwarded-For header');
    assert.equal(keys.indexOf('client-ip'), -1, label + ' sent forbidden Client-IP header');
    assert.equal(keys.indexOf('x-real-ip'), -1, label + ' sent forbidden X-Real-IP header');
  }
}

function loadCodeInStrictSandbox(code, virtualFilename, spyHeaders) {
  var mod = { exports: {} };
  var sandbox = {
    module: mod,
    exports: mod.exports,
    require: function (id) {
      if (id === 'cheerio-without-node-native' || id === 'react-native-cheerio' || id === 'cheerio') return cheerio;
      if (id === 'crypto-js') return CryptoJS;
      throw new Error('Forbidden require inside Nuvio sandbox: ' + id);
    },
    console: { log: function () {}, warn: function () {}, error: function () {} },
    fetch: createMockFetch(spyHeaders),
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    URL: undefined,
    URLSearchParams: undefined,
    AbortSignal: undefined,
    AbortController: undefined,
    setTimeout: undefined,
    clearTimeout: undefined,
    Buffer: undefined,
    process: undefined
  };
  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;

  vm.runInNewContext(code, sandbox, { filename: virtualFilename });
  return mod.exports;
}

test('sandbox: manifest.json schema is valid and references all 13 built provider bundles', function () {
  assert.ok(MANIFEST.name && MANIFEST.version && Array.isArray(MANIFEST.scrapers));
  assert.equal(MANIFEST.scrapers.length, 13);

  for (var i = 0; i < MANIFEST.scrapers.length; i++) {
    var sc = MANIFEST.scrapers[i];
    assert.ok(sc.id && sc.name && sc.filename);
    var fullPath = path.join(ROOT, sc.filename);
    assert.ok(fs.existsSync(fullPath), 'Missing bundle file: ' + sc.filename);
    assert.ok(Array.isArray(sc.supportedTypes) && sc.supportedTypes.length > 0);
  }
});

test('sandbox: every compiled bundle loads and executes cleanly in restricted QuickJS-like VM', async function () {
  for (var i = 0; i < MANIFEST.scrapers.length; i++) {
    var sc = MANIFEST.scrapers[i];
    var spyHeaders = [];
    var bundlePath = path.join(ROOT, sc.filename);
    var code = fs.readFileSync(bundlePath, 'utf8');
    var provider = loadCodeInStrictSandbox(code, bundlePath, spyHeaders);

    assert.equal(typeof provider.getStreams, 'function', sc.id + ' must export getStreams');

    var streams;
    if (sc.id === 'sorozatok_net') {
      streams = await provider.getStreams('1396', 'tv', 1, 1);
    } else if (sc.id === 'mediaklikk') {
      streams = await provider.getStreams('mediaklikk:video:mockTok123', 'movie');
    } else {
      streams = await provider.getStreams('238', 'movie');
    }

    assertValidStreams(streams, sc.id, spyHeaders);
  }
});
