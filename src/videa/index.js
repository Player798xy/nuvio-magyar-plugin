'use strict';

var { createBudget, fetchText } = require('../_shared/http');
var {
  JUNK_TITLE_REGEX,
  extractUploadYearFromText,
  hasVerifiedYearInTitle,
  isTitleMatch,
  isValidRuntime,
  matchesEpisode,
  resolveMediaMeta
} = require('../_shared/meta');
var {
  buildNuvioStream,
  extractVideaInfo,
  finalizeStreams
} = require('../_shared/hosters');

var SKIP_CATEGORIES = {
  zene: true,
  'emberek-vlogok': true,
  'hirek-politika': true,
  vicces: true,
  sport: true,
  jarmuvek: true,
  jatek: true,
  allatok: true,
  'tudomany-technika': true
};

async function scrapeVidea(meta) {
  var streams = [];
  var hu = meta.hungarianTitle || meta.englishTitle;
  if (!hu) return streams;

  var budget = createBudget(45000);
  var isMovie = meta.type === 'movie' || !meta.season;
  var targetYear = meta.year ? parseInt(meta.year, 10) : null;

  var searchTerms = [];
  if (meta.season && meta.episode) {
    var s = meta.season;
    var e = meta.episode;
    var sPad = s < 10 ? '0' + s : String(s);
    var ePad = e < 10 ? '0' + e : String(e);
    if (meta.episodeTitle) searchTerms.push(hu + ' ' + meta.episodeTitle);
    searchTerms.push(hu + ' S' + sPad + 'E' + ePad);
    searchTerms.push(hu + ' ' + e + '. resz');
    searchTerms.push(hu + ' ' + s + 'x' + ePad);
  } else {
    if (meta.year) searchTerms.push(hu + ' ' + meta.year);
    searchTerms.push(hu + ' teljes film');
    searchTerms.push(hu + ' teljes film magyarul');
    searchTerms.push(hu);
  }

  var seenVideoIds = {};
  var candidateItems = [];

  for (var i = 0; i < searchTerms.length && i < 4; i++) {
    if (budget.expired(15000) || candidateItems.length >= 16) break;
    var searchUrl = 'https://videa.hu/kereses/' + encodeURIComponent(searchTerms[i]);
    var res = await fetchText(searchUrl, { headers: { Referer: 'https://videa.hu/' } }, 5000);
    if (!res || !res.ok || !res.text) continue;

    var html = res.text;
    var linkRegex = /href=["'](https?:\/\/videa\.hu)?\/videok\/([^/"'\s]+)\/[^"'#\s]+-([A-Za-z0-9]{16})["']/g;
    var m;
    var addedForTerm = 0;
    while ((m = linkRegex.exec(html)) !== null) {
      var category = m[2];
      var vid = m[3];
      if (SKIP_CATEGORIES[category] || seenVideoIds[vid]) continue;
      seenVideoIds[vid] = true;
      var snippet = html.slice(Math.max(0, (m.index || 0) - 250), Math.min(html.length, (m.index || 0) + 500));
      var cardUploadYear = extractUploadYearFromText(snippet);
      candidateItems.push({ vid: vid, cardUploadYear: cardUploadYear });
      addedForTerm++;
      if (addedForTerm >= 6 || candidateItems.length >= 16) break;
    }
  }

  for (var j = 0; j < candidateItems.length; j++) {
    if (budget.expired(4000)) break;
    var item = candidateItems[j];
    var videoData = await extractVideaInfo(item.vid);
    if (!videoData || !videoData.sources || videoData.sources.length === 0) continue;

    var uploadYear = videoData.uploadYear || item.cardUploadYear;
    if (!isValidRuntime(videoData.duration, meta)) continue;
    if (isMovie && targetYear && uploadYear && uploadYear < targetYear) continue;
    if (JUNK_TITLE_REGEX.test(videoData.videoTitle)) continue;
    if (!isTitleMatch(hu, videoData.videoTitle, meta.year, !isMovie) &&
        !(meta.englishTitle && isTitleMatch(meta.englishTitle, videoData.videoTitle, meta.year, !isMovie))) {
      continue;
    }
    if (!isMovie && !matchesEpisode(videoData.videoTitle, meta.season, meta.episode, meta.episodeTitle)) {
      continue;
    }

    var durationMins = Math.round((videoData.duration || 0) / 60);
    var yearVerified = !isMovie || !targetYear ||
      hasVerifiedYearInTitle(videoData.videoTitle, targetYear, hu) ||
      (meta.englishTitle && hasVerifiedYearInTitle(videoData.videoTitle, targetYear, meta.englishTitle));
    var titleSuffix = (durationMins ? durationMins + ' perc' : '') +
      (!yearVerified && isMovie && targetYear ? ' • Évszám nem igazolt' : '');
    var displayTitle = videoData.videoTitle + (titleSuffix ? ' (' + titleSuffix.replace(/^ • /, '') + ')' : '');

    for (var sIdx = 0; sIdx < videoData.sources.length; sIdx++) {
      var vs = videoData.sources[sIdx];
      var st = buildNuvioStream({
        url: vs.url,
        provider: 'Videa.hu',
        hoster: 'Videa',
        title: displayTitle,
        quality: vs.quality,
        height: vs.height,
        language: 'Magyar Szinkron',
        isHls: false,
        headers: vs.headers
      });
      if (st) streams.push(st);
    }

    var hdCount = streams.filter(function (s) { return parseInt(s.quality, 10) >= 720; }).length;
    if (hdCount >= 4 || streams.length >= 12) break;
  }

  return finalizeStreams(streams);
}

async function getStreams(tmdbId, mediaType, season, episode) {
  var meta = await resolveMediaMeta(tmdbId, mediaType, season, episode);
  if (!meta) return [];
  return await scrapeVidea(meta);
}

module.exports = { getStreams: getStreams, scrapeVidea: scrapeVidea };
