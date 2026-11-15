'use strict';

var { normalizeHttpUrl, decodeHtmlEntities } = require('../_shared/bytes');
var { createBudget, fetchText } = require('../_shared/http');
var {
  resolveMediaMeta,
  normalizeTitle,
  escapeRegExp,
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

var BASE_DOMAINS = ['https://jobbmintatv.org', 'https://jobbmintatv.pro'];

function slugToTitle(href) {
  var clean = String(href || '').split('?')[0].replace(/\/+$/, '');
  var parts = clean.split('/');
  var last = parts[parts.length - 1] || '';
  try { last = decodeURIComponent(last); } catch (_) {}
  return last.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * jobbmintatv.pro/ajax.php responds with charset=windows-1250 without UTF-8 conversion
 * when decoded with res.text(), producing U+FFFD (\ufffd) for Hungarian accented chars
 * in visible anchor text, while the href URL slug remains pure ASCII.
 */
function wildcardFffdMatch(targetTitle, rawCandTitle) {
  if (!rawCandTitle || rawCandTitle.indexOf('\ufffd') === -1) return false;
  var normTarget = normalizeTitle(targetTitle);
  if (!normTarget) return false;

  var asciiParts = String(rawCandTitle)
    .replace(/\(\d{4}\)/g, ' ')
    .replace(/-\s*(film|sorozat|online)$/i, ' ')
    .split('\ufffd')
    .map(function (p) {
      return p.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    });

  // Check if a regex constructed with wildcards for U+FFFD matches the target
  var patternParts = String(rawCandTitle)
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .split('\ufffd')
    .map(function (seg) {
      return escapeRegExp(normalizeTitle(seg)).replace(/\\ /g, '\\s+');
    });

  if (patternParts.length >= 2) {
    var reStr = patternParts.join('[a-z0-9\\s]{1,3}');
    try {
      var re = new RegExp('(?:^|\\s)' + reStr + '(?:\\s|$)', 'i');
      if (re.test(normTarget)) return true;
    } catch (_) {}
  }

  var meaningful = asciiParts.filter(function (p) { return p.length >= 3; });
  if (meaningful.length === 0) return false;
  var hitCount = 0;
  for (var i = 0; i < meaningful.length; i++) {
    if (normTarget.indexOf(meaningful[i]) !== -1) hitCount++;
  }
  return hitCount === meaningful.length;
}

function scoreCandidate(item, hu, en, targetYear, isSeries) {
  var slugTitle = slugToTitle(item.url);
  var rawTitle = item.title || '';
  var hasFffd = rawTitle.indexOf('\ufffd') !== -1;
  var candLabel = (hasFffd || !rawTitle) && slugTitle ? slugTitle : rawTitle;

  if (!isSeries && targetYear) {
    var candYears = extractCandidateYears(candLabel + ' ' + rawTitle, hu);
    if (candYears.length > 0 && !candYears.some(function (cy) { return Math.abs(cy - targetYear) <= 1; })) {
      return -1;
    }
  }

  var huMatch = isTitleMatch(hu, slugTitle, targetYear, isSeries) ||
    (!hasFffd && isTitleMatch(hu, rawTitle, targetYear, isSeries)) ||
    wildcardFffdMatch(hu, rawTitle);

  var enMatch = Boolean(en) && (
    isTitleMatch(en, slugTitle, targetYear, isSeries) ||
    (!hasFffd && isTitleMatch(en, rawTitle, targetYear, isSeries)) ||
    wildcardFffdMatch(en, rawTitle)
  );

  if (!huMatch && !enMatch) return -1;

  var normTarget = normalizeTitle(hu);
  var targetSlug = normTarget.replace(/\s+/g, '_');
  var normTitle = normalizeTitle(candLabel);
  var urlLower = item.url.toLowerCase();

  var score = 0;
  if (normTitle === normTarget || urlLower.indexOf('/' + targetSlug + '/') !== -1 || urlLower.indexOf('/' + targetSlug + '_') !== -1 || urlLower.endsWith('/' + targetSlug)) {
    score += 100;
  } else if (normTitle && (normTitle.indexOf(normTarget) === 0 || normTarget.indexOf(normTitle) === 0)) {
    score += 60;
  } else if (wildcardFffdMatch(hu, rawTitle) || (en && wildcardFffdMatch(en, rawTitle))) {
    score += 60;
  } else {
    var targetWords = normTarget.split(' ').filter(function (w) { return w.length > 2; });
    var itemWords = normTitle.split(' ').filter(function (w) { return w.length > 2; });
    var overlap = 0;
    for (var i = 0; i < targetWords.length; i++) {
      if (itemWords.indexOf(targetWords[i]) !== -1) overlap++;
    }
    if (overlap === 0 && !enMatch) return -1;
    score += targetWords.length > 0 ? (overlap / targetWords.length) * 40 : 40;
  }

  return score >= 40 ? { url: item.url, displayTitle: candLabel, score: score } : null;
}

async function resolveEmbedUrl(rawEmbed, displayTitle, meta, isSeries) {
  var iframeSrc = normalizeHttpUrl(decodeHtmlEntities(rawEmbed));
  if (!iframeSrc || isDownloadOnlyHost(iframeSrc)) return [];

  var lower = iframeSrc.toLowerCase();
  var out = [];

  if (lower.indexOf('videa.hu') !== -1 || lower.indexOf('videakid.hu') !== -1) {
    var vInfo = await extractVideaInfo(iframeSrc);
    if (!vInfo || !vInfo.sources || vInfo.sources.length === 0) return [];
    if (!isValidRuntime(vInfo.duration, meta)) return [];
    if (vInfo.duration > 0 && vInfo.duration < (isSeries ? 480 : 2400)) return [];
    for (var vi = 0; vi < vInfo.sources.length; vi++) {
      var vs = vInfo.sources[vi];
      var s = buildNuvioStream({
        url: vs.url,
        provider: 'JobbMintATV',
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
    if (iInfo.duration > 0 && iInfo.duration < (isSeries ? 480 : 2400)) return [];
    for (var ii = 0; ii < iInfo.sources.length; ii++) {
      var is = iInfo.sources[ii];
      var st = buildNuvioStream({
        url: is.url,
        provider: 'JobbMintATV',
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

  return await resolveAnyEmbed(iframeSrc, 'JobbMintATV', displayTitle, meta, 'Magyar Szinkron');
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var budget = createBudget(45000);
    var meta = await resolveMediaMeta(tmdbId, mediaType, season, episode);
    if (!meta) return [];

    var hu = meta.hungarianTitle || meta.englishTitle;
    if (!hu) return [];

    var isSeries = meta.type === 'series' || Boolean(meta.season && meta.episode);
    var targetYear = meta.year ? parseInt(meta.year, 10) : null;

    var searchTerms = [];
    var addTerm = function (t) {
      var n = normalizeTitle(t);
      if (n && n.length >= 2 && searchTerms.indexOf(n) === -1) searchTerms.push(n);
    };
    addTerm(hu);
    var baseHu = hu.split(/[:\-–&]/)[0].trim();
    if (baseHu && baseHu.length >= 3) addTerm(baseHu);
    if (meta.englishTitle && normalizeTitle(meta.englishTitle) !== normalizeTitle(hu)) {
      addTerm(meta.englishTitle);
      var baseEn = meta.englishTitle.split(/[:\-–&]/)[0].trim();
      if (baseEn && baseEn.length >= 3) addTerm(baseEn);
    }

    var streams = [];
    var seenPages = {};

    for (var ti = 0; ti < searchTerms.length; ti++) {
      if (budget.expired(5000)) break;
      var term = searchTerms[ti];

      for (var di = 0; di < BASE_DOMAINS.length; di++) {
        if (budget.expired(4000)) break;
        var baseDom = BASE_DOMAINS[di];
        var searchUrl = baseDom + '/ajax.php?keres=' + encodeURIComponent(term);
        var res = await fetchText(searchUrl, { headers: { Referer: baseDom + '/' } }, 4500);
        if (!res || !res.ok || !res.text) continue;

        var html = res.text;
        var links = [];
        var linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*><div[^>]*>([\s\S]*?)<\/div><\/a>/gi;
        var lm;
        while ((lm = linkRe.exec(html)) !== null) {
          var u = normalizeHttpUrl(lm[1], baseDom);
          var t = decodeHtmlEntities(lm[2].replace(/<[^>]+>/g, '').trim());
          if (u) links.push({ url: u, title: t });
        }

        if (links.length === 0) continue;

        var scored = [];
        for (var li = 0; li < links.length; li++) {
          var s = scoreCandidate(links[li], hu, meta.englishTitle, targetYear, isSeries);
          if (s && s.score >= 40) scored.push(s);
        }

        if (scored.length === 0) continue;
        scored.sort(function (a, b) { return b.score - a.score; });

        var candidates = scored.slice(0, 3);
        await Promise.all(candidates.map(async function (cand) {
          if (budget.expired(2500)) return;
          var targetUrl = cand.url;
          if (isSeries) {
            var cleanUrl = targetUrl.replace(/\/+$/, '');
            targetUrl = cleanUrl + '/' + meta.season + '_evad/' + meta.episode + '_resz/';
          }
          if (seenPages[targetUrl]) return;
          seenPages[targetUrl] = true;

          var pageRes = await fetchText(targetUrl, { headers: { Referer: baseDom + '/' } }, 5000);
          if (!pageRes || !pageRes.ok || !pageRes.text) return;

          if (!isSeries) {
            var pageCheck = checkPageMetadata(pageRes.text, meta);
            if (!pageCheck.match) return;
          }

          var allEmbeds = [];
          var seenIfr = {};
          var addEmbed = function (src) {
            var norm = normalizeHttpUrl(decodeHtmlEntities(src), baseDom);
            if (norm && !seenIfr[norm]) {
              seenIfr[norm] = true;
              allEmbeds.push(norm);
            }
          };

          var im;
          var ifrRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
          while ((im = ifrRe.exec(pageRes.text)) !== null) addEmbed(im[1]);

          var dm;
          var dataRe = /data-url=["']([^"']+)["']/gi;
          while ((dm = dataRe.exec(pageRes.text)) !== null) addEmbed(dm[1]);

          if (allEmbeds.length === 0) return;

          var settled = await Promise.allSettled(
            allEmbeds.slice(0, 8).map(function (emb) {
              return resolveEmbedUrl(emb, cand.displayTitle || hu, meta, isSeries);
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

        if (streams.length >= 6) break;
      }

      if (streams.length >= 6) break;
    }

    return finalizeStreams(streams);
  } catch (_) {
    return [];
  }
}

module.exports = {
  getStreams: getStreams
};
