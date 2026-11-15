'use strict';

var { normalizeHttpUrl, decodeHtmlEntities } = require('../_shared/bytes');
var { createBudget, fetchText, fetchJson } = require('../_shared/http');
var { resolveMediaMeta, isTitleMatch, isValidRuntime, checkPageMetadata, normalizeTitle } = require('../_shared/meta');
var {
  buildNuvioStream,
  finalizeStreams,
  extractVideaInfo,
  extractIndavideoInfo,
  resolveAnyEmbed,
  isDownloadOnlyHost
} = require('../_shared/hosters');

var BASE_URL = 'https://filmezek.com';

async function resolveEmbedList(embeds, displayTitle, meta, budget) {
  var isSeries = meta.type === 'series' || Boolean(meta.season && meta.episode);
  var out = [];
  var tasks = [];

  for (var i = 0; i < embeds.length && i < 12; i++) {
    if (budget && budget.expired(3000)) break;
    (function (rawEmbed) {
      var clean = normalizeHttpUrl(decodeHtmlEntities(rawEmbed), BASE_URL);
      if (!clean || isDownloadOnlyHost(clean)) return;
      var lower = clean.toLowerCase();

      tasks.push((async function () {
        try {
          if (lower.indexOf('videa.hu') !== -1 || lower.indexOf('videakid.hu') !== -1) {
            var vInfo = await extractVideaInfo(clean);
            if (!vInfo || !vInfo.sources || vInfo.sources.length === 0) return;
            if (!isValidRuntime(vInfo.duration, meta)) return;
            if (vInfo.duration > 0 && vInfo.duration < (isSeries ? 480 : 2400)) return;
            for (var vi = 0; vi < vInfo.sources.length; vi++) {
              var vs = vInfo.sources[vi];
              var s = buildNuvioStream({
                url: vs.url,
                provider: 'Filmezek',
                hoster: 'Videa',
                title: displayTitle,
                quality: vs.quality,
                height: vs.height,
                language: 'Magyar Szinkron',
                isHls: false,
                headers: vs.headers
              });
              if (s) out.push(s);
            }
            return;
          }

          if (lower.indexOf('indavideo.hu') !== -1) {
            var iInfo = await extractIndavideoInfo(clean);
            if (!iInfo || !iInfo.sources || iInfo.sources.length === 0) return;
            if (!isValidRuntime(iInfo.duration, meta)) return;
            if (iInfo.duration > 0 && iInfo.duration < (isSeries ? 480 : 2400)) return;
            for (var ii = 0; ii < iInfo.sources.length; ii++) {
              var is = iInfo.sources[ii];
              var st = buildNuvioStream({
                url: is.url,
                provider: 'Filmezek',
                hoster: 'Indavideo',
                title: displayTitle,
                quality: is.quality,
                height: is.height,
                language: 'Magyar Szinkron',
                isHls: false,
                headers: is.headers
              });
              if (st) out.push(st);
            }
            return;
          }

          var resolved = await resolveAnyEmbed(clean, 'Filmezek', displayTitle, meta, 'Magyar Szinkron');
          if (resolved && resolved.length > 0) {
            for (var ri = 0; ri < resolved.length; ri++) {
              out.push(resolved[ri]);
            }
          }
        } catch (_) {}
      })());
    })(embeds[i]);
  }

  await Promise.allSettled(tasks);
  return out;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var budget = createBudget(45000);
    var meta = await resolveMediaMeta(tmdbId, mediaType, season, episode);
    if (!meta) return [];

    var hu = meta.hungarianTitle || meta.englishTitle;
    if (!hu) return [];

    var searchTerms = [];
    var addTerm = function (t) {
      if (t && searchTerms.indexOf(t) === -1) searchTerms.push(t);
    };
    addTerm(hu);
    var strippedHu = hu.replace(/^(?:A|Az)\s+/i, '');
    if (strippedHu !== hu) addTerm(strippedHu);
    if (meta.englishTitle && normalizeTitle(meta.englishTitle) !== normalizeTitle(hu)) {
      addTerm(meta.englishTitle);
      var strippedEn = meta.englishTitle.replace(/^(?:The|A|An)\s+/i, '');
      if (strippedEn !== meta.englishTitle) addTerm(strippedEn);
    }

    var isSeries = meta.type === 'series' || Boolean(meta.season && meta.episode);
    var targetYear = meta.year ? parseInt(meta.year, 10) : null;
    var allStreams = [];
    var seenPages = {};

    for (var qi = 0; qi < searchTerms.length; qi++) {
      if (budget.expired(5000)) break;
      var term = searchTerms[qi];
      var searchUrl = BASE_URL + '/searchinput.php?searchType=1&term=' + encodeURIComponent(term);
      var items = await fetchJson(searchUrl, { headers: { Referer: BASE_URL + '/' } }, 6000);
      if (!Array.isArray(items) || items.length === 0) continue;

      var matchingItems = items.filter(function (it) {
        if (!it) return false;
        if (it.MovieCover && meta.imdbId && String(it.MovieCover).indexOf(meta.imdbId) !== -1) {
          if (isSeries && it.type && it.type !== 'online-sorozatok') return false;
          if (!isSeries && it.type && it.type !== 'online-filmek') return false;
          if (isSeries && meta.season) {
            var tStr = String(it.MovieTitle || it.value || it.label || '');
            if (tStr && tStr.indexOf(meta.season + '.') === -1) return false;
          }
          return true;
        }
        return false;
      });

      if (matchingItems.length === 0) {
        matchingItems = items.filter(function (it) {
          if (!it) return false;
          var title = it.MovieTitle || it.value || it.label || '';
          var itemYear = parseInt(it.MovieYear || it.year || '', 10);
          if (!isSeries && targetYear && !isNaN(itemYear) && Math.abs(itemYear - targetYear) > 1) {
            return false;
          }
          if (isSeries && it.type === 'online-sorozatok') {
            return isTitleMatch(hu, title, meta.year, true) && (!meta.season || String(title).indexOf(meta.season + '.') !== -1);
          }
          if (!isSeries && it.type === 'online-filmek') {
            return isTitleMatch(hu, title, meta.year, false) ||
              (meta.englishTitle && isTitleMatch(meta.englishTitle, title, meta.year, false));
          }
          return false;
        });
      }

      if (matchingItems.length === 0) continue;

      for (var mi = 0; mi < matchingItems.length && mi < 3; mi++) {
        if (budget.expired(4000)) break;
        var matchingItem = matchingItems[mi];
        var pageType = matchingItem.type || (isSeries ? 'online-sorozatok' : 'online-filmek');
        if (!matchingItem.MovieSlug) continue;
        var itemUrl = BASE_URL + '/' + pageType + '/' + matchingItem.MovieSlug + '/';
        if (seenPages[itemUrl]) continue;
        seenPages[itemUrl] = true;

        var pageRes = await fetchText(itemUrl, { headers: { Referer: BASE_URL + '/' } }, 6000);
        if (!pageRes || !pageRes.ok || !pageRes.text) continue;

        if (!isSeries) {
          var pageCheck = checkPageMetadata(pageRes.text, meta);
          if (!pageCheck.match) continue;
        }

        var embeds = [];
        var embedSeen = {};
        var pushEmbed = function (u) {
          var norm = normalizeHttpUrl(decodeHtmlEntities(u), BASE_URL);
          if (norm && !embedSeen[norm]) {
            embedSeen[norm] = true;
            embeds.push(norm);
          }
        };

        var dm;
        var dataUrlRe = /data-url=["']([^"']+)["']/gi;
        while ((dm = dataUrlRe.exec(pageRes.text)) !== null) pushEmbed(dm[1]);

        var im;
        var iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
        while ((im = iframeRe.exec(pageRes.text)) !== null) pushEmbed(im[1]);

        if (embeds.length === 0) continue;

        var displayTitle = matchingItem.MovieTitle || hu;
        var resolved = await resolveEmbedList(embeds, displayTitle, meta, budget);
        for (var si = 0; si < resolved.length; si++) {
          allStreams.push(resolved[si]);
        }

        if (allStreams.length > 0) break;
      }

      if (allStreams.length > 0) break;
    }

    return finalizeStreams(allStreams);
  } catch (_) {
    return [];
  }
}

module.exports = {
  getStreams: getStreams
};
