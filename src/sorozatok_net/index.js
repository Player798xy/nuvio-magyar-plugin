'use strict';

var { normalizeHttpUrl, decodeHtmlEntities } = require('../_shared/bytes');
var { createBudget, fetchText, resolveRedirectUrl } = require('../_shared/http');
var { decodeHunter } = require('../_shared/crypto_decoders');
var { resolveMediaMeta, normalizeTitle, escapeRegExp } = require('../_shared/meta');
var { finalizeStreams, resolveAnyEmbed, isDownloadOnlyHost } = require('../_shared/hosters');

var BASE_URL = 'https://sorozatok.net';

var searchIndexCache = null;
var searchIndexTime = 0;
var seriesPageCache = {};

async function getSorozatokIndex() {
  if (searchIndexCache && Date.now() - searchIndexTime < 6 * 3600 * 1000) {
    return searchIndexCache;
  }
  var res = await fetchText(BASE_URL + '/api/search.json', { headers: { Referer: BASE_URL + '/' } }, 7000);
  if (res && res.ok && res.text) {
    try {
      var parsed = JSON.parse(res.text);
      if (Array.isArray(parsed) && parsed.length > 100) {
        searchIndexCache = parsed;
        searchIndexTime = Date.now();
        return parsed;
      }
    } catch (_) {}
  }
  return searchIndexCache || [];
}

async function getSeriesHtml(seriesUrl) {
  var cached = seriesPageCache[seriesUrl];
  if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
    return cached.html;
  }
  var res = await fetchText(seriesUrl, { headers: { Referer: BASE_URL + '/' } }, 6000);
  if (res && res.ok && res.text) {
    var keys = Object.keys(seriesPageCache);
    if (keys.length >= 40) {
      delete seriesPageCache[keys[0]];
    }
    seriesPageCache[seriesUrl] = { ts: Date.now(), html: res.text };
    return res.text;
  }
  return null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var budget = createBudget(45000);
    var meta = await resolveMediaMeta(tmdbId, mediaType, season, episode);
    if (!meta) return [];

    if (meta.type !== 'series' || !meta.season || !meta.episode) return [];

    var titles = [];
    if (meta.hungarianTitle) titles.push(meta.hungarianTitle);
    if (meta.englishTitle && titles.indexOf(meta.englishTitle) === -1) titles.push(meta.englishTitle);
    if (titles.length === 0) return [];

    var index = await getSorozatokIndex();
    var normTargets = titles.map(normalizeTitle).filter(Boolean);
    var matchedSeries = null;

    for (var i = 0; i < index.length; i++) {
      var item = index[i];
      var huNorm = normalizeTitle(item.cat_name);
      var enNorm = normalizeTitle(item.cat_eng);
      if (normTargets.indexOf(huNorm) !== -1 || normTargets.indexOf(enNorm) !== -1) {
        matchedSeries = item;
        break;
      }
    }

    var targetYear = meta.year ? parseInt(meta.year, 10) : null;
    if (!matchedSeries) {
      for (var j = 0; j < index.length; j++) {
        var it = index[j];
        var itemYear = it.year ? parseInt(it.year, 10) : null;
        if (targetYear && itemYear && Math.abs(targetYear - itemYear) > 2) continue;
        var itHu = normalizeTitle(it.cat_name);
        var itEn = normalizeTitle(it.cat_eng);
        var hit = normTargets.some(function (t) {
          if (t.length <= 3) return false;
          var re = new RegExp('(?:^|\\s)' + escapeRegExp(t) + '(?:\\s|$)', 'i');
          return re.test(itHu) || re.test(itEn);
        });
        if (hit) {
          matchedSeries = it;
          break;
        }
      }
    }

    var slug = (matchedSeries && matchedSeries.url)
      ? matchedSeries.url
      : normalizeTitle(meta.hungarianTitle || meta.englishTitle).replace(/\s+/g, '-');
    if (!slug || budget.expired(5000)) return [];

    var seriesUrl = BASE_URL + '/' + slug + '-online';
    var seriesHtml = await getSeriesHtml(seriesUrl);
    if (!seriesHtml || budget.expired(4000)) return [];

    var targetEpHref = null;
    var targetEmbedId = null;
    var targetEpTitle = '';

    var clipRe = /<a[^>]+class="clip-link"[^>]*>[\s\S]*?<h4[^>]+class="video-title"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/gi;
    var m;
    while ((m = clipRe.exec(seriesHtml)) !== null) {
      var fullTag = m[0];
      var hrefMatch = fullTag.match(/href="([^"]+)"/i);
      if (!hrefMatch) continue;
      var epTitle = decodeHtmlEntities(m[1].trim());
      var nums = [];
      var numRe = /\d+/g;
      var nm;
      while ((nm = numRe.exec(epTitle)) !== null) {
        nums.push(parseInt(nm[0], 10));
      }
      if (nums.length >= 2) {
        var sNum = nums[nums.length - 2];
        var eNum = nums[nums.length - 1];
        if (sNum === Number(meta.season) && eNum === Number(meta.episode)) {
          targetEpHref = hrefMatch[1];
          var idMatch = fullTag.match(/data-id="(\d+)"/i);
          targetEmbedId = idMatch ? idMatch[1] : null;
          targetEpTitle = epTitle;
          break;
        }
      }
    }

    if (!targetEpHref) return [];

    var epUrl = normalizeHttpUrl(targetEpHref, BASE_URL);
    var urlIdMatch = epUrl.match(/watch.*v=([a-zA-Z0-9_-]+)/);
    var urlId = urlIdMatch ? urlIdMatch[1] : null;
    if (!urlId) return [];

    if (!targetEmbedId) {
      var epPage = await fetchText(epUrl, { headers: { Referer: seriesUrl } }, 6000);
      if (!epPage || !epPage.ok || !epPage.text) return [];
      var embedIdMatch =
        epPage.text.match(new RegExp('data-id="([^"]+)"[^>]*' + escapeRegExp(urlId))) ||
        epPage.text.match(/data-id="(\d+)"/i);
      if (!embedIdMatch) return [];
      targetEmbedId = embedIdMatch[1];
    }

    var goUrl = BASE_URL + '/go.php?id=' + encodeURIComponent(targetEmbedId) + '&key=' + encodeURIComponent(urlId);
    var sbPage = await fetchText(goUrl, { headers: { Referer: epUrl } }, 6500);
    if (!sbPage || !sbPage.ok || !sbPage.text) return [];

    var hunterRegex = /decodeURIComponent\(escape\(r\)\)\}\(\s*["']([^"']+)["']\s*,\s*(\d+)\s*,\s*["']([^"']+)["']\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g;
    var hosterUrls = [];
    var hm;
    while ((hm = hunterRegex.exec(sbPage.text)) !== null) {
      var decoded = decodeHunter(hm[1], Number(hm[2]), hm[3], Number(hm[4]), Number(hm[5]));
      var vpMatch = decoded.match(/https?:\/\/[^\s"'<>]+\/videoplayback\.php\?hash=[a-zA-Z0-9]+/);
      if (vpMatch && hosterUrls.indexOf(vpMatch[0]) === -1) {
        hosterUrls.push(vpMatch[0]);
      }
    }

    var directVpRe = /https?:\/\/[^\s"'<>]+\/videoplayback\.php\?hash=[a-zA-Z0-9]+/g;
    var dvm;
    while ((dvm = directVpRe.exec(sbPage.text)) !== null) {
      if (hosterUrls.indexOf(dvm[0]) === -1) hosterUrls.push(dvm[0]);
    }

    if (hosterUrls.length === 0) return [];

    var displayLabel = targetEpTitle ||
      ((matchedSeries && matchedSeries.cat_name) || meta.hungarianTitle || meta.englishTitle) + ' S' + meta.season + 'E' + meta.episode;
    var seenLocs = {};
    var streams = [];

    await Promise.allSettled(hosterUrls.slice(0, 6).map(async function (vpUrl) {
      if (budget.expired(2500)) return;
      var loc = await resolveRedirectUrl(vpUrl, { headers: { Referer: goUrl } }, 6000);
      if (!loc || isDownloadOnlyHost(loc) || seenLocs[loc]) return;
      seenLocs[loc] = true;

      var resolved = await resolveAnyEmbed(loc, 'Sorozatok.net', displayLabel, meta, 'Magyar Szinkron');
      for (var ri = 0; ri < resolved.length; ri++) {
        streams.push(resolved[ri]);
      }
    }));

    return finalizeStreams(streams);
  } catch (_) {
    return [];
  }
}

module.exports = {
  getStreams: getStreams
};
