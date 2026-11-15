'use strict';

var { resolveMediaMeta, normalizeMediaType } = require('../_shared/meta');
var { finalizeStreams } = require('../_shared/hosters');

var netmozi = require('../netmozi');
var jobbmintatv = require('../jobbmintatv');
var filmezek = require('../filmezek');
var onlinefilmek = require('../onlinefilmek');
var hdmozi = require('../hdmozi');
var dmdamedia = require('../dmdamedia');
var sorozatokNet = require('../sorozatok_net');
var videa = require('../videa');
var indavideo = require('../indavideo');
var filmvilag = require('../filmvilag');
var mediaklikk = require('../mediaklikk');
var mesefilm = require('../mesefilm');
var videakid = require('../videakid');

function withSoftTimeout(promise, ms) {
  if (typeof setTimeout !== 'function' || typeof clearTimeout !== 'function') {
    return promise.catch(function () { return []; });
  }
  var timer = null;
  return Promise.race([
    promise.catch(function () { return []; }).then(function (res) {
      if (timer) clearTimeout(timer);
      return Array.isArray(res) ? res : [];
    }),
    new Promise(function (resolve) {
      timer = setTimeout(function () {
        resolve([]);
      }, ms);
    })
  ]);
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var rawId = String(tmdbId || '').trim();
    if (!rawId) return [];

    if (/^mediaklikk/i.test(rawId)) {
      var mkOut = await mediaklikk.getStreams(rawId, mediaType, season, episode);
      return finalizeStreams(mkOut || [], { maxStreams: 10 });
    }
    if (/^netmozi:/i.test(rawId)) {
      var nmOut = await netmozi.getStreams(rawId, mediaType, season, episode);
      return finalizeStreams(nmOut || [], { maxStreams: 10 });
    }

    // Resolve and warm meta cache once before fanning out across all scrapers
    var meta = await resolveMediaMeta(rawId, mediaType, season, episode);
    if (!meta) return [];

    var isSeries = meta.type === 'series' || normalizeMediaType(mediaType) === 'series' || Boolean(season && episode);

    var scrapers = [
      netmozi,
      jobbmintatv,
      filmezek,
      onlinefilmek,
      hdmozi,
      dmdamedia,
      videa,
      indavideo,
      mediaklikk,
      mesefilm,
      videakid
    ];

    if (isSeries) {
      scrapers.push(sorozatokNet);
    } else {
      scrapers.push(filmvilag);
    }

    var batches = await Promise.all(
      scrapers.map(function (sc) {
        return withSoftTimeout(
          Promise.resolve().then(function () {
            return sc.getStreams(rawId, mediaType, season, episode);
          }),
          14000
        );
      })
    );

    var combined = [];
    for (var i = 0; i < batches.length; i++) {
      var list = batches[i];
      if (!Array.isArray(list)) continue;
      for (var j = 0; j < list.length; j++) {
        if (list[j]) combined.push(list[j]);
      }
    }

    return finalizeStreams(combined, { maxStreams: 10 });
  } catch (_) {
    return [];
  }
}

module.exports = {
  getStreams: getStreams
};
