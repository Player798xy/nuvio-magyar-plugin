'use strict';

var cheerio = require('cheerio-without-node-native');
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

var BASE_URL = 'https://www.onlinefilmekingyen1.com';

function encodeForm(obj) {
  var parts = [];
  for (var k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(obj[k])));
    }
  }
  return parts.join('&');
}

function findBestDooPlayItem(results, meta) {
  if (!results || typeof results !== 'object') return null;
  var targetHu = normalizeTitle(meta.hungarianTitle || '');
  var targetEn = normalizeTitle(meta.englishTitle || '');
  var targetYear = meta.year ? parseInt(meta.year, 10) : null;
  var isSeries = meta.type === 'series' || Boolean(meta.season && meta.episode);

  var bestItem = null;
  var bestScore = -1;

  var keys = Object.keys(results);
  for (var i = 0; i < keys.length; i++) {
    var item = results[keys[i]];
    if (!item || !item.url) continue;

    var isTvShow = String(item.url).indexOf('/tvshows/') !== -1;
    if (isSeries && !isTvShow) continue;
    if (!isSeries && isTvShow) continue;

    var itemTitle = normalizeTitle(item.title || '');
    var itemYear = item.extra && item.extra.date ? parseInt(item.extra.date, 10) : null;

    var score = 0;
    if (itemTitle === targetHu || (targetEn && itemTitle === targetEn)) {
      score += 100;
    } else if ((targetHu && (itemTitle.indexOf(targetHu) === 0 || targetHu.indexOf(itemTitle) === 0)) ||
               (targetEn && (itemTitle.indexOf(targetEn) === 0 || targetEn.indexOf(itemTitle) === 0))) {
      score += 60;
    } else {
      var compareTarget = targetHu || targetEn;
      var targetWords = compareTarget.split(' ').filter(function (w) { return w.length > 2; });
      var itemWords = itemTitle.split(' ').filter(function (w) { return w.length > 2; });
      var overlap = 0;
      for (var wi = 0; wi < targetWords.length; wi++) {
        if (itemWords.indexOf(targetWords[wi]) !== -1) overlap++;
      }
      if (overlap === 0) continue;
      score += (overlap / Math.max(targetWords.length, 1)) * 40;
    }

    if (targetYear && itemYear && !isNaN(itemYear)) {
      if (itemYear === targetYear) {
        score += 50;
      } else if (Math.abs(itemYear - targetYear) <= 1) {
        score += 20;
      } else if (!isSeries) {
        continue;
      } else {
        score -= 70;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  return bestScore >= 40 ? bestItem : null;
}

async function resolveDooPlayPlayer(post, nume, type, referer) {
  try {
    var v2Url = BASE_URL + '/wp-json/dooplayer/v2/' + encodeURIComponent(post) + '/' + encodeURIComponent(type || 'movie') + '/' + encodeURIComponent(nume);
    var json = await fetchJson(v2Url, { headers: { Referer: referer } }, 4500);
    if (json && json.embed_url) return decodeHtmlEntities(json.embed_url);
  } catch (_) {}

  try {
    var body = encodeForm({
      action: 'doo_player_ajax',
      post: post,
      nume: nume,
      type: type || 'movie'
    });
    var ajaxRes = await fetchText(BASE_URL + '/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: referer
      },
      body: body
    }, 4500);
    if (ajaxRes && ajaxRes.ok && ajaxRes.text) {
      var parsed = JSON.parse(ajaxRes.text);
      if (parsed && parsed.embed_url) return decodeHtmlEntities(parsed.embed_url);
    }
  } catch (_) {}

  return null;
}

async function resolveEmbedUrl(embedUrl, displayTitle, meta) {
  var normalized = normalizeHttpUrl(embedUrl, BASE_URL);
  if (!normalized || isDownloadOnlyHost(normalized)) return [];

  var lower = normalized.toLowerCase();
  var out = [];

  if (lower.indexOf('videa.hu') !== -1 || lower.indexOf('videakid.hu') !== -1) {
    var vInfo = await extractVideaInfo(normalized);
    if (!vInfo || !vInfo.sources || vInfo.sources.length === 0) return [];
    if (!isValidRuntime(vInfo.duration, meta)) return [];
    for (var i = 0; i < vInfo.sources.length; i++) {
      var vs = vInfo.sources[i];
      var s = buildNuvioStream({
        url: vs.url,
        provider: 'OnlineFilmek',
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
    var iInfo = await extractIndavideoInfo(normalized);
    if (!iInfo || !iInfo.sources || iInfo.sources.length === 0) return [];
    if (!isValidRuntime(iInfo.duration, meta)) return [];
    for (var j = 0; j < iInfo.sources.length; j++) {
      var is = iInfo.sources[j];
      var st = buildNuvioStream({
        url: is.url,
        provider: 'OnlineFilmek',
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

  return await resolveAnyEmbed(normalized, 'OnlineFilmek', displayTitle, meta, 'Magyar Szinkron');
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

    var streams = [];
    var seenEmbeds = {};
    var seenPages = {};

    for (var qi = 0; qi < searchTerms.length; qi++) {
      if (budget.expired(5000)) break;
      var term = searchTerms[qi];
      var itemUrl = null;
      var postTitle = '';

      // 1. DooPlay search JSON endpoint
      var apiUrl = BASE_URL + '/wp-json/dooplay/search/?keyword=' + encodeURIComponent(term) + '&nonce=7b089995bb';
      var apiRes = await fetchJson(apiUrl, { headers: { Referer: BASE_URL + '/' } }, 4500);
      if (apiRes) {
        var matched = findBestDooPlayItem(apiRes, meta);
        if (matched) {
          itemUrl = matched.url;
          postTitle = matched.title || '';
        }
      }

      // 2. Standard WP HTML search fallback
      if (!itemUrl && !budget.expired(6000)) {
        var wpUrl = BASE_URL + '/?s=' + encodeURIComponent(term);
        var wpRes = await fetchText(wpUrl, { headers: { Referer: BASE_URL + '/' } }, 5000);
        if (wpRes && wpRes.ok && wpRes.text) {
          var $wp = cheerio.load(wpRes.text);
          $wp('article').each(function (_, el) {
            if (itemUrl) return;
            var $a = $wp(el).find('.title a').first();
            var mUrl = $a.attr('href') || '';
            var mTitle = decodeHtmlEntities($a.text().trim());
            if (!mUrl || !mTitle) return;

            var yText = $wp(el).find('.year').first().text().trim();
            var mYear = /^\d{4}$/.test(yText) ? parseInt(yText, 10) : null;
            if (!isSeries && targetYear && mYear && Math.abs(mYear - targetYear) > 1) return;

            var isTvUrl = mUrl.indexOf('/tvshows/') !== -1;
            if (isSeries && !isTvUrl) return;
            if (!isSeries && isTvUrl) return;

            if (isTitleMatch(hu, mTitle, meta.year, isSeries) ||
                (meta.englishTitle && isTitleMatch(meta.englishTitle, mTitle, meta.year, isSeries))) {
              itemUrl = mUrl;
              postTitle = mTitle;
            }
          });
        }
      }

      if (!itemUrl) continue;

      var targetUrl = normalizeHttpUrl(itemUrl, BASE_URL);
      if (isSeries) {
        var slugMatch = targetUrl.match(/\/tvshows\/([^/]+)\/?/);
        if (slugMatch) {
          targetUrl = BASE_URL + '/episodes/' + slugMatch[1] + '-' + meta.season + 'x' + meta.episode + '/';
        }
      }

      if (seenPages[targetUrl]) continue;
      seenPages[targetUrl] = true;

      var pageRes = await fetchText(targetUrl, { headers: { Referer: BASE_URL + '/' } }, 5500);
      if (!pageRes || !pageRes.ok || !pageRes.text) continue;

      if (!isSeries) {
        var pageCheck = checkPageMetadata(pageRes.text, meta);
        if (!pageCheck.match) continue;
      }

      var $page = cheerio.load(pageRes.text);
      var playerOptions = [];
      $page('[data-post][data-nume]').each(function (_, el) {
        var $el = $page(el);
        var post = $el.attr('data-post');
        var nume = $el.attr('data-nume');
        var type = $el.attr('data-type') || (isSeries ? 'tv' : 'movie');
        if (post && nume && nume !== 'trailer') {
          playerOptions.push({ post: post, nume: nume, type: type });
        }
      });

      var inlineEmbeds = [];
      $page('iframe[src]').each(function (_, el) {
        var src = $page(el).attr('src');
        if (src && src.indexOf('youtube.com') === -1 && src.indexOf('googletagmanager') === -1) {
          inlineEmbeds.push(src);
        }
      });

      var optionEmbeds = await Promise.all(
        playerOptions.slice(0, 6).map(function (opt) {
          return resolveDooPlayPlayer(opt.post, opt.nume, opt.type, targetUrl).catch(function () { return null; });
        })
      );

      var allCandidates = [];
      for (var oi = 0; oi < optionEmbeds.length; oi++) {
        if (optionEmbeds[oi]) allCandidates.push(optionEmbeds[oi]);
      }
      for (var ii = 0; ii < inlineEmbeds.length; ii++) {
        allCandidates.push(inlineEmbeds[ii]);
      }

      var uniqueEmbeds = [];
      for (var ci = 0; ci < allCandidates.length; ci++) {
        var normUrl = normalizeHttpUrl(allCandidates[ci], BASE_URL);
        if (normUrl && !seenEmbeds[normUrl]) {
          seenEmbeds[normUrl] = true;
          uniqueEmbeds.push(normUrl);
        }
      }

      var resolvedBatches = await Promise.allSettled(
        uniqueEmbeds.slice(0, 8).map(function (embed) {
          return resolveEmbedUrl(embed, postTitle || hu, meta);
        })
      );

      for (var bi = 0; bi < resolvedBatches.length; bi++) {
        var b = resolvedBatches[bi];
        if (b.status === 'fulfilled' && Array.isArray(b.value)) {
          for (var si = 0; si < b.value.length; si++) {
            streams.push(b.value[si]);
          }
        }
      }

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
