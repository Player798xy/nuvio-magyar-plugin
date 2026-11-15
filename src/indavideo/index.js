'use strict';

var { createBudget, fetchText } = require('../_shared/http');
var {
  extractUploadYearFromText,
  hasVerifiedYearInTitle,
  isTitleMatch,
  isValidRuntime,
  matchesEpisode,
  resolveMediaMeta
} = require('../_shared/meta');
var {
  buildNuvioStream,
  extractIndavideoInfo,
  finalizeStreams
} = require('../_shared/hosters');

async function scrapeIndavideo(meta) {
  var streams = [];
  var hu = meta.hungarianTitle || meta.englishTitle;
  if (!hu) return streams;

  var budget = createBudget(45000);
  var isSeries = meta.type === 'series' || Boolean(meta.season);
  var targetYear = meta.year ? parseInt(meta.year, 10) : null;

  var searchTerms = [];
  if (meta.season && meta.episode) {
    var s = meta.season;
    var e = meta.episode;
    var ePad = e < 10 ? '0' + e : String(e);
    if (meta.episodeTitle) searchTerms.push(hu + ' ' + meta.episodeTitle);
    searchTerms.push(hu + ' ' + s + ' evad ' + e + ' resz');
    searchTerms.push(hu + ' ' + e + '. resz');
    searchTerms.push(hu + ' S' + s + 'E' + ePad);
    searchTerms.push(hu);
  } else {
    searchTerms.push(hu);
    searchTerms.push(hu + ' teljes film');
    if (meta.year) searchTerms.push(hu + ' ' + meta.year);
  }

  var seenVideoUrls = {};
  var urlsToProcess = [];

  var queryWords = [];
  for (var qi = 0; qi < searchTerms.length; qi++) {
    var folded = String(searchTerms[qi] || '').toLowerCase()
      .replace(/[áàâäã]/g, 'a')
      .replace(/[éèêë]/g, 'e')
      .replace(/[íìîï]/g, 'i')
      .replace(/[óòôöőõ]/g, 'o')
      .replace(/[úùûüűũ]/g, 'u');
    var parts = folded.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/);
    for (var pi = 0; pi < parts.length; pi++) {
      if (parts[pi].length >= 2 && queryWords.indexOf(parts[pi]) === -1) queryWords.push(parts[pi]);
    }
  }

  for (var i = 0; i < searchTerms.length && i < 3; i++) {
    if (budget.expired(15000) || urlsToProcess.length >= 10) break;
    var searchUrl = 'https://indavideo.hu/search?search=' + encodeURIComponent(searchTerms[i]) + '&view=detailed&sort_mode=magic';
    var res = await fetchText(searchUrl, { headers: { Referer: 'https://indavideo.hu/' } }, 5000);
    if (!res || !res.ok || !res.text) continue;

    var prioritized = [];
    var fallback = [];
    var indexLinks = [];
    var pageSeen = {};
    var linkRe = /href=["'](https?:\/\/(?:[a-z0-9-]+\.)?indavideo\.hu\/video\/[^"'#\s]+)["']/gi;
    var m;
    while ((m = linkRe.exec(res.text)) !== null) {
      var vUrl = m[1];
      if (seenVideoUrls[vUrl] || pageSeen[vUrl]) continue;
      pageSeen[vUrl] = true;
      if (/^https?:\/\/index\.indavideo\.hu\//i.test(vUrl)) {
        indexLinks.push(vUrl);
        continue;
      }
      var slugLower = vUrl.slice(vUrl.lastIndexOf('/video/') + 7).toLowerCase();
      var hasWord = false;
      for (var wi = 0; wi < queryWords.length; wi++) {
        if (slugLower.indexOf(queryWords[wi]) !== -1) {
          hasWord = true;
          break;
        }
      }
      if (hasWord) prioritized.push(vUrl);
      else fallback.push(vUrl);
    }

    var combined = prioritized.concat(fallback, indexLinks);
    for (var ci = 0; ci < combined.length; ci++) {
      var chosen = combined[ci];
      if (!seenVideoUrls[chosen]) {
        seenVideoUrls[chosen] = true;
        urlsToProcess.push(chosen);
        if (urlsToProcess.length >= 10) break;
      }
    }
  }

  for (var j = 0; j < urlsToProcess.length; j++) {
    if (budget.expired(4000)) break;
    var pageRes = await fetchText(urlsToProcess[j], { headers: { Referer: 'https://indavideo.hu/' } }, 5000);
    if (!pageRes || !pageRes.ok || !pageRes.text) continue;

    var pHtml = pageRes.text;
    var hashMatch = pHtml.match(/id=['"]emb_hash['"][^>]+value=['"]([^'"]+)['"]/i) ||
                    pHtml.match(/value=['"]([^'"]+)['"][^>]+id=['"]emb_hash['"]/i) ||
                    pHtml.match(/embed\.indavideo\.hu\/player\/video\/([a-zA-Z0-9]+)/i);
    if (!hashMatch) continue;

    var vData = await extractIndavideoInfo(hashMatch[1]);
    if (!vData || !vData.sources || vData.sources.length === 0) continue;

    var uploadYear = vData.uploadYear || extractUploadYearFromText(pHtml);
    if (!isValidRuntime(vData.duration, meta)) continue;
    if (!isSeries && targetYear && uploadYear && uploadYear < targetYear) continue;

    if (!isTitleMatch(hu, vData.videoTitle, meta.year, isSeries) &&
        !(meta.englishTitle && isTitleMatch(meta.englishTitle, vData.videoTitle, meta.year, isSeries))) {
      continue;
    }
    if (isSeries && !matchesEpisode(vData.videoTitle, meta.season, meta.episode, meta.episodeTitle)) {
      continue;
    }

    var durationMins = Math.round((vData.duration || 0) / 60);
    var yearVerified = isSeries || !targetYear ||
      hasVerifiedYearInTitle(vData.videoTitle, targetYear, hu) ||
      (meta.englishTitle && hasVerifiedYearInTitle(vData.videoTitle, targetYear, meta.englishTitle));
    var titleLabel = vData.videoTitle + (durationMins ? ' (' + durationMins + ' perc)' : '') +
      (!yearVerified ? ' (Év?)' : '');

    for (var sIdx = 0; sIdx < vData.sources.length; sIdx++) {
      var src = vData.sources[sIdx];
      var st = buildNuvioStream({
        url: src.url,
        provider: 'Indavideo.hu',
        hoster: 'Indavideo',
        title: titleLabel,
        quality: src.quality,
        height: src.height,
        language: 'Magyar Szinkron',
        isHls: false,
        headers: src.headers
      });
      if (st) streams.push(st);
    }

    if (streams.length >= 6) break;
  }

  return finalizeStreams(streams);
}

async function getStreams(tmdbId, mediaType, season, episode) {
  var meta = await resolveMediaMeta(tmdbId, mediaType, season, episode);
  if (!meta) return [];
  return await scrapeIndavideo(meta);
}

module.exports = { getStreams: getStreams, scrapeIndavideo: scrapeIndavideo };
