'use strict';

var cheerio = require('cheerio-without-node-native');
var { normalizeHttpUrl, decodeHtmlEntities } = require('../_shared/bytes');
var { createBudget, fetchText } = require('../_shared/http');
var {
  resolveMediaMeta,
  normalizeTitle,
  isTitleMatch,
  isValidRuntime,
  checkPageMetadata,
  extractCandidateYears
} = require('../_shared/meta');
var {
  buildNuvioStream,
  finalizeStreams,
  extractVideaInfo,
  extractIndavideoInfo,
  resolveAnyEmbed,
  isDownloadOnlyHost
} = require('../_shared/hosters');

var BASE_URL = 'https://dmdamedia.hu';

var EXCLUDED_PATHS = {
  '/filmek': true,
  '/sorozatok': true,
  '/hirek': true,
  '/kapcsolat': true,
  '/belepes': true,
  '/regisztracio': true,
  '/kereses': true,
  '/top-filmek': true,
  '/top-sorozatok': true,
  '/rolunk': true,
  '/kategoria': true,
  '/szineszek': true,
  '/cdn-cgi': true
};

function isExcludedPath(path) {
  var lower = String(path || '').toLowerCase();
  if (!lower || lower.charAt(0) !== '/' || lower.length <= 2) return true;
  if (EXCLUDED_PATHS[lower]) return true;
  if (lower.indexOf('/kategoria') === 0 || lower.indexOf('/szineszek') === 0 || lower.indexOf('/cdn-cgi') === 0) return true;
  return false;
}

async function resolveDmdaEmbed(embedUrl, cleanItemTitle, meta) {
  var normalized = normalizeHttpUrl(decodeHtmlEntities(embedUrl), BASE_URL);
  if (!normalized || isDownloadOnlyHost(normalized)) return [];

  var lower = normalized.toLowerCase();
  var out = [];

  if (lower.indexOf('videa.hu') !== -1 || lower.indexOf('videakid.hu') !== -1) {
    var vInfo = await extractVideaInfo(normalized);
    if (!vInfo || !vInfo.sources || vInfo.sources.length === 0) return [];
    if (!isValidRuntime(vInfo.duration, meta)) return [];
    for (var vi = 0; vi < vInfo.sources.length; vi++) {
      var vs = vInfo.sources[vi];
      var s = buildNuvioStream({
        url: vs.url,
        provider: 'DMDAMedia',
        hoster: 'Videa',
        title: cleanItemTitle,
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
    var iInfo = await extractIndavideoInfo(normalized);
    if (!iInfo || !iInfo.sources || iInfo.sources.length === 0) return [];
    if (!isValidRuntime(iInfo.duration, meta)) return [];
    for (var ii = 0; ii < iInfo.sources.length; ii++) {
      var is = iInfo.sources[ii];
      var st = buildNuvioStream({
        url: is.url,
        provider: 'DMDAMedia',
        hoster: 'Indavideo',
        title: cleanItemTitle,
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

  return await resolveAnyEmbed(normalized, 'DMDAMedia', cleanItemTitle, meta, 'Magyar Szinkron');
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var budget = createBudget(45000);
    var meta = await resolveMediaMeta(tmdbId, mediaType, season, episode);
    if (!meta) return [];

    var hu = meta.hungarianTitle || meta.englishTitle;
    if (!hu) return [];

    var queries = [];
    var addQuery = function (q) {
      var clean = String(q || '').trim();
      if (clean && queries.indexOf(clean) === -1) queries.push(clean);
    };
    addQuery(hu);
    if (meta.englishTitle) addQuery(meta.englishTitle);
    if (hu.indexOf(' - ') !== -1) {
      var parts = hu.split(' - ');
      for (var pi = 0; pi < parts.length; pi++) {
        var part = parts[pi].trim();
        if (part.length >= 3) addQuery(part);
      }
    }

    var isSeries = meta.type === 'series' || Boolean(meta.season && meta.episode);
    var targetYear = meta.year ? parseInt(meta.year, 10) : null;
    var normTarget = normalizeTitle(hu);
    var streams = [];

    for (var qi = 0; qi < queries.length; qi++) {
      if (budget.expired(5000)) break;
      var q = queries[qi];
      var searchRes = await fetchText(BASE_URL + '/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: BASE_URL + '/'
        },
        body: 'search=' + encodeURIComponent(q)
      }, 6000);

      if (!searchRes || !searchRes.ok || !searchRes.text) continue;

      var $ = cheerio.load(searchRes.text);
      var links = [];
      $('a[href]').each(function (_, el) {
        var rawHref = $(el).attr('href') || '';
        var path = rawHref.split('?')[0];
        if (isExcludedPath(path)) return;
        var title = decodeHtmlEntities($(el).text().replace(/\s+/g, ' ').trim());
        links.push({ url: path, title: title });
      });

      if (links.length === 0) continue;

      var scored = [];
      for (var li = 0; li < links.length; li++) {
        var item = links[li];
        if (!isSeries && targetYear) {
          var candYears = extractCandidateYears(item.title, hu);
          if (candYears.length > 0 && !candYears.some(function (cy) { return Math.abs(cy - targetYear) <= 1; })) {
            continue;
          }
        }

        var cleanCand = item.title
          .replace(/^(?:Film|Sorozat)\s+(?:[0-9.]+\s+)?/i, '')
          .replace(/\s+\d{4}$/, '')
          .trim();
        var normItem = normalizeTitle(cleanCand || item.title);

        var score = 0;
        if (normItem === normTarget) {
          score += 100;
        } else if (isTitleMatch(hu, cleanCand || item.title, meta.year, isSeries) ||
                   (meta.englishTitle && isTitleMatch(meta.englishTitle, cleanCand || item.title, meta.year, isSeries))) {
          score += 50;
        }

        if (!isSeries && targetYear) {
          var cyList = extractCandidateYears(item.title, hu);
          if (cyList.some(function (cy) { return Math.abs(cy - targetYear) <= 1; })) {
            score += 40;
          }
        }

        if (isSeries && item.url.indexOf('_sorozat') !== -1) score += 30;
        if (!isSeries && item.url.indexOf('_film') !== -1) score += 30;

        if (score >= 50) {
          scored.push({ url: item.url, title: item.title, score: score });
        }
      }

      if (scored.length === 0) continue;
      scored.sort(function (a, b) { return b.score - a.score; });

      var candidates = scored.slice(0, 3);
      await Promise.all(candidates.map(async function (cand) {
        if (budget.expired(3000)) return;
        var targetUrl = BASE_URL + cand.url;
        if (isSeries) {
          targetUrl = BASE_URL + cand.url + '/' + meta.season + '.evad/' + meta.episode + '.resz';
        }

        var pageRes = await fetchText(targetUrl, { headers: { Referer: BASE_URL + '/' } }, 5500);
        if (!pageRes || !pageRes.ok || !pageRes.text) return;

        var pageHtml = pageRes.text;
        if (!isSeries) {
          var pageCheck = checkPageMetadata(pageHtml, meta);
          if (!pageCheck.match) return;
        }

        var iframes = [];
        var seenIfr = {};
        var pushIframe = function (src) {
          var clean = normalizeHttpUrl(decodeHtmlEntities(src), BASE_URL);
          if (clean && !seenIfr[clean]) {
            seenIfr[clean] = true;
            iframes.push(clean);
          }
        };

        var ifRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
        var im;
        while ((im = ifRe.exec(pageHtml)) !== null) pushIframe(im[1]);

        var uniqueTabs = [];
        var tabRe = /href=["'](\?a=[^"'#]+)(?:#[^"']*)?["']/gi;
        var tm;
        while ((tm = tabRe.exec(pageHtml)) !== null) {
          if (uniqueTabs.indexOf(tm[1]) === -1) uniqueTabs.push(tm[1]);
        }

        if (uniqueTabs.length > 0) {
          await Promise.all(uniqueTabs.slice(0, 5).map(async function (tab) {
            try {
              var tabRes = await fetchText(targetUrl + tab, { headers: { Referer: targetUrl } }, 4500);
              if (!tabRes || !tabRes.ok || !tabRes.text) return;
              var tRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
              var tim;
              while ((tim = tRe.exec(tabRes.text)) !== null) pushIframe(tim[1]);
            } catch (_) {}
          }));
        }

        if (iframes.length === 0) return;

        var cleanItemTitle = (cand.title || hu)
          .replace(/\r?\n/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/^(?:Film|Sorozat)\s+(?:[0-9.]+\s+)?/i, '')
          .replace(/\s+\d{4}$/, '')
          .trim();
        if (!cleanItemTitle || cleanItemTitle.length < 2) cleanItemTitle = hu;

        var settled = await Promise.allSettled(
          iframes.slice(0, 8).map(function (ifr) {
            return resolveDmdaEmbed(ifr, cleanItemTitle, meta);
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
