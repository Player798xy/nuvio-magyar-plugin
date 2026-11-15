'use strict';

var { createBudget, fetchText } = require('../_shared/http');
var {
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

async function scrapeVideakid(meta) {
  var titles = [];
  if (meta.hungarianTitle) titles.push(meta.hungarianTitle);
  if (meta.englishTitle && titles.indexOf(meta.englishTitle) === -1) titles.push(meta.englishTitle);
  if (titles.length === 0) return [];

  var budget = createBudget(45000);
  var isMovie = meta.type === 'movie' || !meta.season;
  var queries = [];
  var addQ = function (q) {
    if (q && queries.indexOf(q) === -1) queries.push(q);
  };

  for (var i = 0; i < titles.length && i < 2; i++) {
    var t = titles[i];
    if (!isMovie && meta.season && meta.episode) {
      if (meta.episodeTitle) addQ(t + ' ' + meta.episodeTitle);
      addQ(t + ' ' + meta.season + '. évad ' + meta.episode + '. rész');
      addQ(t + ' ' + meta.episode + '. rész');
      addQ(t);
    } else {
      addQ(t);
    }
  }

  var candidates = [];
  var seen = {};

  for (var qIdx = 0; qIdx < queries.length && qIdx < 3; qIdx++) {
    if (budget.expired(15000) || candidates.length >= 6) break;
    var searchUrl = 'https://videakid.hu/kereses/' + encodeURIComponent(queries[qIdx]);
    var res = await fetchText(searchUrl, { headers: { Referer: 'https://videakid.hu/' } }, 6000);
    if (!res || !res.ok || !res.text) continue;

    var linkRegex = /<a[^>]+href=["'](https?:\/\/videakid\.hu\/videok\/[^"']+-([a-zA-Z0-9]{16}))["'][^>]+(?:title|aria-label)=["']([^"']+)["']/gi;
    var m;
    while ((m = linkRegex.exec(res.text)) !== null) {
      var href = m[1];
      var vcode = m[2];
      var title = m[3].trim();
      if (seen[vcode]) continue;
      var matchesAnyTitle = titles.some(function (candT) {
        return isTitleMatch(candT, title, meta.year, !isMovie);
      });
      if (!matchesAnyTitle) continue;
      if (!isMovie && !matchesEpisode(title, meta.season, meta.episode, meta.episodeTitle)) continue;
      seen[vcode] = true;
      candidates.push({ url: href, vcode: vcode, title: title });
      if (candidates.length >= 6) break;
    }
  }

  var streams = [];
  var targetYear = meta.year ? parseInt(meta.year, 10) : null;

  for (var cIdx = 0; cIdx < candidates.length && cIdx < 5; cIdx++) {
    if (budget.expired(4000)) break;
    var c = candidates[cIdx];
    var videoData = await extractVideaInfo(c.vcode, 'https://videakid.hu');
    if (!videoData || !videoData.sources || videoData.sources.length === 0) {
      videoData = await extractVideaInfo(c.vcode, 'https://videa.hu');
    }
    if (!videoData || !videoData.sources || videoData.sources.length === 0) continue;

    if (isMovie) {
      if (!isValidRuntime(videoData.duration, meta)) continue;
    } else {
      if (videoData.duration > 0 && videoData.duration < 180) continue;
    }
    if (isMovie && targetYear && videoData.uploadYear && videoData.uploadYear < targetYear) continue;

    var candTitle = videoData.videoTitle || c.title;
    var yearVerified = !isMovie || !targetYear || titles.some(function (candT) {
      return hasVerifiedYearInTitle(candTitle, targetYear, candT);
    });
    var durationMins = Math.round((videoData.duration || 0) / 60);
    var label = candTitle + (durationMins ? ' (' + durationMins + ' perc)' : '') + (!yearVerified ? ' (Év?)' : '');

    for (var sIdx = 0; sIdx < videoData.sources.length; sIdx++) {
      var vs = videoData.sources[sIdx];
      var st = buildNuvioStream({
        url: vs.url,
        provider: 'Videakid',
        hoster: 'Videakid',
        title: label,
        quality: vs.quality,
        height: vs.height,
        language: 'Magyar Szinkron',
        isHls: false,
        headers: vs.headers
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
  return await scrapeVideakid(meta);
}

module.exports = { getStreams: getStreams, scrapeVideakid: scrapeVideakid };
