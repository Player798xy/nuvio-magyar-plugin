'use strict';

var path = require('node:path');
var assert = require('node:assert/strict');

var ROOT = path.resolve(__dirname, '..');

const TEST_CASES = [
  { args: ['27205', 'movie'], label: 'Inception (2010)' },
  { args: ['748783', 'movie'], label: 'Garfield (2024)' },
  { args: ['1396', 'tv', 1, 1], label: 'Breaking Bad S01E01' },
  { args: ['tt0131636', 'movie'], label: 'Vuk (1981)' },
  { args: ['tt0056789', 'tv', 1, 1], label: 'A Tenkes kapitánya S01E01' },
  { args: ['mediaklikk-live-m4', 'movie'], label: 'M4 Sport Élő' }
];

async function main() {
  console.log('=== Nuvio Magyar Plugin — Unified Live Integration Test ===\n');
  var magyar = require(path.join(ROOT, 'providers', 'magyar.js'));
  var passed = 0;

  for (var i = 0; i < TEST_CASES.length; i++) {
    var tc = TEST_CASES[i];
    var start = Date.now();
    var streams = await magyar.getStreams.apply(null, tc.args);
    var ms = Date.now() - start;

    assert.ok(Array.isArray(streams), tc.label + ' must return an array');
    assert.ok(streams.length <= 10, tc.label + ' exceeded max 10 curated streams: ' + streams.length);

    var heights = [];
    for (var sIdx = 0; sIdx < streams.length; sIdx++) {
      var st = streams[sIdx];
      assert.ok(st.url && /^https?:\/\//.test(st.url));
      assert.ok(st.type === 'hls' || st.type === 'mp4');
      heights.push(parseInt(st.quality, 10) || 0);
    }

    var hasHd = heights.some(function (h) { return h >= 720; });
    if (hasHd) {
      assert.ok(heights.every(function (h) { return h >= 720; }), tc.label + ' leaked <720p clutter despite HD: ' + heights.join(','));
    }

    if (streams.length > 0) passed++;
    console.log('[' + tc.label + '] ' + streams.length + ' stream(s) in ' + ms + ' ms');
    for (var k = 0; k < streams.length; k++) {
      console.log('   ' + (k + 1) + '. ' + streams[k].name + ' -> ' + streams[k].url.slice(0, 70) + '...');
    }
    console.log('');
  }

  console.log('Summary: ' + passed + '/' + TEST_CASES.length + ' test titles returned clean curated Hungarian streams.');
  assert.equal(passed, TEST_CASES.length, 'Expected all test titles to return live playable streams');
}

main().catch(function (err) {
  console.error('Live test failed:', err);
  process.exit(1);
});
