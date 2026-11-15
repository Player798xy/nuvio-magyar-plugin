'use strict';

var { normalizeHttpUrl, decodeHtmlEntities } = require('../_shared/bytes');
var { createBudget, fetchText } = require('../_shared/http');
var {
  resolveMediaMeta,
  isTitleMatch,
  isValidRuntime,
  checkPageMetadata,
  matchesEpisode
} = require('../_shared/meta');
var {
  buildNuvioStream,
  finalizeStreams,
  extractVideaInfo,
  extractIndavideoInfo,
  resolveAnyEmbed
} = require('../_shared/hosters');

var BASE_URL = 'https://mesekincstar.tv';

var NON_POST_SLUGS = {
  'online-mesek': true,
  'disney-mesek': true,
  'magyar-mesek': true,
  'mesesorozatok': true,
  'regi-mesek': true,
  'a-grimm-testverek-legszebb-mesei': true,
  'monszter-high-mesek': true,
  'karacsonyi-mesek': true,
  'kapcsolat': true,
  'adatvedelem': true,
  'adatvedelmi-nyilatkozat': true,
  'jognyilatkozat': true
};

async function searchMeseKincstar(query) {
  var results = [];
  var searchUrl = BASE_URL + '/mesekereso/' + encodeURIComponent(query);
  var res = await fetchText(searchUrl, { headers: { Referer: BASE_URL + '/' } }, 6000);
  if (!res || !res.ok || !res.text) return results;

  var seen = {};
  var re = /<a[^>]+href=["'](https?:\/\/mesekincstar\.tv\/(?:mesek\/[^"'#?]+|[a-z0-9][a-z0-9-]{2,}\/?))["'][^>]*>([\s\S]*?)<\/a>/gi;
  var m;
  while ((m = re.exec(res.text)) !== null) {
    var url = m[1];
    var cleanPath = url.replace(/^https?:\/\/mesekincstar\.tv\/?/i, '').replace(/\/$/, '');
    if (!cleanPath || NON_POST_SLUGS[cleanPath.toLowerCase()]) continue;
    if (/^(?:category|tag|wp-|author|page|feed|mesekereso)/i.test(cleanPath)) continue;

    var title = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    if (!seen[url] && title.length > 2 && title.toLowerCase().indexOf('tovább') === -1) {
      seen[url] = true;
      results.push({ url: url, title: title });
    }
  }
  return results;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var budget = createBudget(45000);
    var meta = await resolveMediaMeta(tmdbId, mediaType, season, episode);
    if (!meta) return [];

    var hu = meta.hungarianTitle || meta.englishTitle;
    if (!hu) return [];

    var isSeries = meta.type === 'series' || Boolean(meta.season && meta.episode);
    var isMovie = !isSeries;
    var targetYear = meta.year ? parseInt(meta.year, 10) : null;

    var queries = [hu];
    var stripped = hu.replace(/^(?:A|Az)\s+/i, '');
    if (stripped && queries.indexOf(stripped) === -1) queries.push(stripped);
    if (meta.englishTitle && meta.englishTitle !== hu && queries.indexOf(meta.englishTitle) === -1) {
      queries.push(meta.englishTitle);
    }

    var linkBatches = await Promise.all(
      queries.map(function (q) {
        return searchMeseKincstar(q).catch(function () { return []; });
      })
    );

    var matchingLinks = [];
    var seenDetail = {};
    for (var bi = 0; bi < linkBatches.length; bi++) {
      var links = linkBatches[bi];
      for (var li = 0; li < links.length; li++) {
        var item = links[li];
        if (seenDetail[item.url]) continue;
        if (!isTitleMatch(hu, item.title, meta.year, isSeries) &&
            !(meta.englishTitle && isTitleMatch(meta.englishTitle, item.title, meta.year, isSeries))) {
          continue;
        }
        if (isSeries && !matchesEpisode(item.title, meta.season, meta.episode, meta.episodeTitle)) {
          continue;
        }
        seenDetail[item.url] = true;
        matchingLinks.push(item);
        if (matchingLinks.length >= 4) break;
      }
      if (matchingLinks.length >= 4) break;
    }

    if (matchingLinks.length === 0 || budget.expired(4000)) return [];

    var streams = [];
    await Promise.allSettled(matchingLinks.map(async function (item) {
      if (budget.expired(2500)) return;
      var pageRes = await fetchText(item.url, { headers: { Referer: BASE_URL + '/' } }, 5000);
      if (!pageRes || !pageRes.ok || !pageRes.text) return;

      var pageHtml = pageRes.text;
      if (isMovie) {
        var pageCheck = checkPageMetadata(pageHtml, meta);
        if (!pageCheck.match) return;
      }

      var videaTargets = [];
      var seenV = {};
      var addV = function (v) {
        if (v && !seenV[v]) {
          seenV[v] = true;
          videaTargets.push(v);
        }
      };

      var vm;
      var vRe1 = /videa\.hu\/player\?[^"'\s>]*v=([a-zA-Z0-9]{16})/gi;
      while ((vm = vRe1.exec(pageHtml)) !== null) addV(vm[1]);
      var vRe2 = /videa\.hu\/videok\/[^"'\s]+-([a-zA-Z0-9]{16})/gi;
      while ((vm = vRe2.exec(pageHtml)) !== null) addV(vm[1]);
      var vReF = /(?:https?:)?\/\/videa\.hu\/player\?[^"'\s>]*f=[0-9.]+[^"'\s>]*/gi;
      while ((vm = vReF.exec(pageHtml)) !== null) addV(normalizeHttpUrl(vm[0]));

      var indaHashes = [];
      var seenI = {};
      var im;
      var iRe = /embed\.indavideo\.hu\/player\/video\/([a-zA-Z0-9]+)/gi;
      while ((im = iRe.exec(pageHtml)) !== null) {
        if (!seenI[im[1]]) {
          seenI[im[1]] = true;
          indaHashes.push(im[1]);
        }
      }

      var otherEmbeds = [];
      var ifRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
      var ifm;
      while ((ifm = ifRe.exec(pageHtml)) !== null) {
        var norm = normalizeHttpUrl(ifm[1], item.url);
        if (!norm) continue;
        var nl = norm.toLowerCase();
        if (nl.indexOf('videa.hu') === -1 && nl.indexOf('indavideo.hu') === -1 &&
            nl.indexOf('youtube.com') === -1 && nl.indexOf('googletagmanager') === -1) {
          otherEmbeds.push(norm);
        }
      }

      await Promise.allSettled([
        Promise.allSettled(videaTargets.map(async function (vt) {
          var vInfo = await extractVideaInfo(vt);
          if (!vInfo || !vInfo.sources || vInfo.sources.length === 0) return;
          if (!isValidRuntime(vInfo.duration, meta)) return;
          if (isMovie && targetYear && vInfo.uploadYear && vInfo.uploadYear < targetYear) return;

          var vTitleMatches =
            isTitleMatch(hu, vInfo.videoTitle, meta.year, isSeries) ||
            (meta.englishTitle && isTitleMatch(meta.englishTitle, vInfo.videoTitle, meta.year, isSeries)) ||
            isTitleMatch(item.title, vInfo.videoTitle, meta.year, isSeries);
          if (!vTitleMatches) return;
          if (isSeries && !matchesEpisode(vInfo.videoTitle, meta.season, meta.episode, meta.episodeTitle) &&
              !matchesEpisode(item.title, meta.season, meta.episode, meta.episodeTitle)) {
            return;
          }

          for (var vi = 0; vi < vInfo.sources.length; vi++) {
            var vs = vInfo.sources[vi];
            var st = buildNuvioStream({
              url: vs.url,
              provider: 'MeseKincstár',
              hoster: 'Videa',
              title: item.title + ' (' + vInfo.videoTitle + ')',
              quality: vs.quality,
              height: vs.height,
              language: 'Magyar Mese',
              isHls: false,
              headers: vs.headers
            });
            if (st) streams.push(st);
          }
        })),
        Promise.allSettled(indaHashes.map(async function (ih) {
          var iInfo = await extractIndavideoInfo(ih);
          if (!iInfo || !iInfo.sources || iInfo.sources.length === 0) return;
          if (!isValidRuntime(iInfo.duration, meta)) return;

          var iTitle = iInfo.videoTitle || item.title;
          var iTitleMatches =
            isTitleMatch(hu, iTitle, meta.year, isSeries) ||
            (meta.englishTitle && isTitleMatch(meta.englishTitle, iTitle, meta.year, isSeries));
          if (!iTitleMatches) return;

          for (var ii = 0; ii < iInfo.sources.length; ii++) {
            var is = iInfo.sources[ii];
            var st = buildNuvioStream({
              url: is.url,
              provider: 'MeseKincstár',
              hoster: 'Indavideo',
              title: item.title,
              quality: is.quality,
              height: is.height,
              language: 'Magyar Mese',
              isHls: false,
              headers: is.headers
            });
            if (st) streams.push(st);
          }
        })),
        Promise.allSettled(otherEmbeds.slice(0, 4).map(async function (oe) {
          var resolved = await resolveAnyEmbed(oe, 'MeseKincstár', item.title || hu, meta, 'Magyar Mese');
          for (var oi = 0; oi < resolved.length; oi++) {
            streams.push(resolved[oi]);
          }
        }))
      ]);
    }));

    return finalizeStreams(streams);
  } catch (_) {
    return [];
  }
}

module.exports = {
  getStreams: getStreams
};
