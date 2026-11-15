'use strict';

var { normalizeHttpUrl, decodeHtmlEntities } = require('../_shared/bytes');
var { createBudget, fetchText } = require('../_shared/http');
var { resolveMediaMeta, normalizeTitle, isTitleMatch, isValidRuntime, checkPageMetadata } = require('../_shared/meta');
var {
  buildNuvioStream,
  finalizeStreams,
  extractVideaInfo,
  extractIndavideoInfo,
  resolveAnyEmbed,
  isDownloadOnlyHost
} = require('../_shared/hosters');

var KATALOG_URL = 'https://katalog.estranky.cz/';
var REFERER_URL = 'https://onlinefilmvilag2.eu/';

async function resolveEmbedUrl(rawEmbed, displayTitle, meta) {
  var iframeSrc = normalizeHttpUrl(decodeHtmlEntities(rawEmbed), REFERER_URL);
  if (!iframeSrc || isDownloadOnlyHost(iframeSrc)) return [];

  var lower = iframeSrc.toLowerCase();
  var out = [];

  if (lower.indexOf('videa.hu') !== -1 || lower.indexOf('videakid.hu') !== -1) {
    var vInfo = await extractVideaInfo(iframeSrc);
    if (!vInfo || !vInfo.sources || vInfo.sources.length === 0) return [];
    if (!isValidRuntime(vInfo.duration, meta)) return [];
    for (var vi = 0; vi < vInfo.sources.length; vi++) {
      var vs = vInfo.sources[vi];
      var s = buildNuvioStream({
        url: vs.url,
        provider: 'Filmvilág2',
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
    return out;
  }

  if (lower.indexOf('indavideo.hu') !== -1) {
    var iInfo = await extractIndavideoInfo(iframeSrc);
    if (!iInfo || !iInfo.sources || iInfo.sources.length === 0) return [];
    if (!isValidRuntime(iInfo.duration, meta)) return [];
    for (var ii = 0; ii < iInfo.sources.length; ii++) {
      var is = iInfo.sources[ii];
      var st = buildNuvioStream({
        url: is.url,
        provider: 'Filmvilág2',
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
    return out;
  }

  return await resolveAnyEmbed(iframeSrc, 'Filmvilág2', displayTitle, meta, 'Magyar Szinkron');
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var budget = createBudget(45000);
    var meta = await resolveMediaMeta(tmdbId, mediaType, season, episode);
    if (!meta) return [];

    var hu = meta.hungarianTitle || meta.englishTitle;
    if (!hu) return [];

    var searchQueries = [hu];
    var strippedHu = hu.replace(/^(?:A|Az)\s+/i, '');
    if (strippedHu && searchQueries.indexOf(strippedHu) === -1) searchQueries.push(strippedHu);
    if (meta.englishTitle && normalizeTitle(meta.englishTitle) !== normalizeTitle(hu)) {
      searchQueries.push(meta.englishTitle);
    }

    var isSeries = meta.type === 'series' || Boolean(meta.season && meta.episode);
    var streams = [];
    var seenArticles = {};

    for (var qi = 0; qi < searchQueries.length; qi++) {
      if (budget.expired(5000)) break;
      var q = searchQueries[qi];
      var body = 'uid=1504382&key=' + encodeURIComponent(q);

      var searchRes = await fetchText(KATALOG_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: REFERER_URL
        },
        body: body
      }, 5000);

      if (!searchRes || !searchRes.ok || !searchRes.text) continue;

      var links = [];
      var linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      var lm;
      while ((lm = linkRe.exec(searchRes.text)) !== null) {
        var u = lm[1].replace(/^http:\/\//i, 'https://');
        var t = decodeHtmlEntities(lm[2].replace(/<[^>]+>/g, '').trim());
        if (u.indexOf('.html') !== -1 &&
            u.indexOf('filmkeres-es-hibas-link') === -1 &&
            t.indexOf('http') !== 0 &&
            !seenArticles[u]) {
          seenArticles[u] = true;
          links.push({ url: u, title: t });
        }
      }

      if (links.length === 0) continue;

      var candidates = links.filter(function (item) {
        var cleanT = item.title.replace(/\(\s*(?:FHD|HD|SD|CAM|HUN|Sub)\s*\)/gi, '').trim();
        return isTitleMatch(hu, cleanT, meta.year, isSeries) ||
          (meta.englishTitle && isTitleMatch(meta.englishTitle, cleanT, meta.year, isSeries));
      }).slice(0, 4);

      if (candidates.length === 0) continue;

      await Promise.all(candidates.map(async function (item) {
        if (budget.expired(2500)) return;
        var artRes = await fetchText(item.url, { headers: { Referer: REFERER_URL } }, 5000);
        if (!artRes || !artRes.ok || !artRes.text) return;

        if (!isSeries) {
          var pageCheck = checkPageMetadata(artRes.text, meta);
          if (!pageCheck.match) return;
        }

        var iframes = [];
        var seenIfr = {};
        var ifRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
        var im;
        while ((im = ifRe.exec(artRes.text)) !== null) {
          var norm = normalizeHttpUrl(im[1], item.url);
          if (norm && !seenIfr[norm]) {
            seenIfr[norm] = true;
            iframes.push(norm);
          }
        }

        if (iframes.length === 0) return;

        var settled = await Promise.allSettled(
          iframes.slice(0, 8).map(function (emb) {
            return resolveEmbedUrl(emb, item.title || hu, meta);
          })
        );

        for (var si = 0; si < settled.length; si++) {
          if (settled[si].status === 'fulfilled' && Array.isArray(settled[si].value)) {
            for (var sj = 0; sj < settled[si].value.length; sj++) {
              streams.push(settled[si].value[sj]);
            }
          }
        }
      }));

      if (streams.length > 0) break;
    }

    return finalizeStreams(streams);
  } catch (_) {
    return [];
  }
}

module.exports = {
  getStreams: getStreams
};
