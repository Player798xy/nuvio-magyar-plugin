'use strict';

var fs = require('node:fs');
var path = require('node:path');
var assert = require('node:assert/strict');

var ROOT = path.resolve(__dirname, '..');

// Ensure fetch runs directly without proxy headers
function loadProvider(id) {
  return require(path.join(ROOT, 'providers', id + '.js'));
}

const TEST_CASES = [
  { id: 'videa', args: ['tt0131636', 'movie'], label: 'Vuk (1981)' },
  { id: 'indavideo', args: ['tt0131636', 'movie'], label: 'Vuk (1981)' },
  { id: 'videakid', args: ['101795', 'tv', 1, 1], label: 'Pom-Pom újabb meséi (1978) S01E01' },
  { id: 'mesefilm', args: ['748783', 'movie'], label: 'Garfield (2024)' },
  { id: 'mediaklikk', args: ['tt0056789', 'tv', 1, 1], label: 'A Tenkes kapitánya S01E01' },
  { id: 'hdmozi', args: ['1011985', 'movie'], label: 'Kung Fu Panda 4 (2024)' },
  { id: 'filmezek', args: ['19995', 'movie'], label: 'Avatar (2009)' },
  { id: 'onlinefilmek', args: ['748783', 'movie'], label: 'Garfield (2024)' },
  { id: 'dmdamedia', args: ['1396', 'tv', 1, 1], label: 'Breaking Bad S01E01' },
  { id: 'sorozatok_net', args: ['1396', 'tv', 1, 1], label: 'Breaking Bad S01E01' },
  { id: 'jobbmintatv', args: ['27205', 'movie'], label: 'Inception (2010)' },
  { id: 'filmvilag', args: ['27205', 'movie'], label: 'Inception (2010)' },
  { id: 'netmozi', args: ['19995', 'movie'], label: 'Avatar (2009)' }
];

async function main() {
  console.log('=== Nuvio Magyar Plugin — Live Smoke Integration Test ===\n');
  var results = [];

  for (var i = 0; i < TEST_CASES.length; i++) {
    var tc = TEST_CASES[i];
    var start = Date.now();
    try {
      var mod = loadProvider(tc.id);
      var streams = await mod.getStreams.apply(null, tc.args);
      var ms = Date.now() - start;

      assert.ok(Array.isArray(streams), tc.id + ' must return an array');
      for (var sIdx = 0; sIdx < streams.length; sIdx++) {
        var st = streams[sIdx];
        assert.ok(st.url && /^https?:\/\//.test(st.url));
        assert.ok(st.type === 'hls' || st.type === 'mp4');
      }

      results.push({ id: tc.id, label: tc.label, count: streams.length, ms: ms, sample: streams[0] ? streams[0].url : null });
      var preview = streams[0] ? streams[0].name + ' -> ' + streams[0].url.slice(0, 72) + '...' : '0 streams (empty / host blocked)';
      console.log('[' + tc.id.padEnd(13) + '] ' + String(streams.length).padStart(2) + ' stream(s) | ' + String(ms).padStart(5) + ' ms | ' + tc.label + ' | ' + preview);
    } catch (err) {
      var errMs = Date.now() - start;
      results.push({ id: tc.id, label: tc.label, count: -1, ms: errMs, error: err.message });
      console.log('[' + tc.id.padEnd(13) + '] ERROR     | ' + String(errMs).padStart(5) + ' ms | ' + err.message);
    }
  }

  var workingCount = results.filter(function (r) { return r.count > 0; }).length;
  console.log('\nSummary: ' + workingCount + '/' + TEST_CASES.length + ' providers returned real playable streams.');

  // Verify live MédiaKlikk channel lookup as well
  var mk = loadProvider('mediaklikk');
  var liveM4 = await mk.getStreams('mediaklikk-live-m4', 'movie');
  console.log('[mediaklikk M4] ' + liveM4.length + ' live stream(s)' + (liveM4[0] ? ' -> ' + liveM4[0].url.slice(0, 72) + '...' : ''));

  // At least half the portals must return real streams in live smoke check (some portals may geo/CF gate datacenter IPs)
  assert.ok(workingCount >= 6, 'Expected at least 6 live providers to return real streams, got ' + workingCount);
}

main().catch(function (err) {
  console.error('Live test failed:', err);
  process.exit(1);
});
