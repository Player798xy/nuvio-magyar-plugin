'use strict';

var cheerio = require('cheerio-without-node-native');
var { normalizeHttpUrl, decodeHtmlEntities } = require('../_shared/bytes');
var { createBudget, fetchText, fetchJson } = require('../_shared/http');
var { resolveMediaMeta, normalizeTitle, escapeRegExp, isValidRuntime, checkPageMetadata } = require('../_shared/meta');
var {
  buildNuvioStream,
  finalizeStreams,
  extractVideaInfo,
  extractRpmStream,
  resolveAnyEmbed
} = require('../_shared/hosters');

var HDMOZI_BASE = 'https://hdmozi.hu';

function encodeForm(obj) {
  var parts = [];
  for (var k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(obj[k])));
    }
  }
  return parts.join('&');
}

function createHdmoziUrl(mediaInfo, season, episode) {
  var urlTitle = String(mediaInfo.title || '')
    .toLowerCase()
    .replace(/[áàâäã]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôöőõ]/g, 'o')
    .replace(/[úùûüűũ]/g, 'u')
    .replace(/[ýÿ]/g, 'y')
    .replace(/ç/g, 'c')
    .replace(/ñ/g, 'n')
    .replace(/ß/g, 'ss')
    .replace(/[/:.,;!?()[\]]/g, '-')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!urlTitle) return null;

  if (mediaInfo.type === 'movie') {
    return HDMOZI_BASE + '/movies/' + urlTitle + '/';
  }
  if (mediaInfo.type === 'series' && season && episode) {
    return HDMOZI_BASE + '/episodes/' + urlTitle + '-' + season + 'x' + episode + '/';
  }
  if (mediaInfo.type === 'series') {
    return HDMOZI_BASE + '/tvshows/' + urlTitle + '/';
  }
  return null;
}

async function resolveHdmoziUrl(mediaInfo, season, episode) {
  try {
    var searchUrl = HDMOZI_BASE + '/?s=' + encodeURIComponent(mediaInfo.title);
    var resp = await fetchText(searchUrl, { headers: { Referer: HDMOZI_BASE + '/' } }, 5000);
    if (!resp || !resp.ok || !resp.text) {
      return createHdmoziUrl(mediaInfo, season, episode);
    }

    var $ = cheerio.load(resp.text);
    var results = [];
    $('.details').each(function (_, el) {
      var $a = $(el).find('.title a').first();
      var href = $a.attr('href') || '';
      var title = decodeHtmlEntities($a.text().trim());
      if (!href || !title) return;
      var yearTxt = $(el).find('.year').first().text().trim();
      var year = /^\d{4}$/.test(yearTxt) ? parseInt(yearTxt, 10) : null;
      var type = href.indexOf('/movies/') !== -1
        ? 'movie'
        : ((href.indexOf('/series/') !== -1 || href.indexOf('/tvshows/') !== -1 || href.indexOf('/episodes/') !== -1) ? 'series' : 'unknown');
      results.push({ href: href, title: title, year: year, type: type });
    });

    if (results.length === 0) {
      return createHdmoziUrl(mediaInfo, season, episode);
    }

    var targetTitle = normalizeTitle(mediaInfo.title);
    var targetRe = new RegExp('(?:^|\\s)' + escapeRegExp(targetTitle) + '(?:\\s|$)', 'i');

    var scored = results.map(function (r) {
      var rt = normalizeTitle(r.title);
      var score = 0;
      if (rt === targetTitle) {
        score += 100;
      } else if (targetRe.test(rt) || (rt.length > 3 && new RegExp('(?:^|\\s)' + escapeRegExp(rt) + '(?:\\s|$)', 'i').test(targetTitle))) {
        score += 60;
      }

      if (mediaInfo.type === 'movie' && mediaInfo.year && r.year) {
        var diff = Math.abs(mediaInfo.year - r.year);
        if (diff > 1) return { href: r.href, title: r.title, year: r.year, type: r.type, score: -1000 };
        score += 50 - diff * 10;
      } else if (mediaInfo.year && r.year) {
        var diffS = Math.abs(mediaInfo.year - r.year);
        score += Math.max(0, 30 - diffS * 10);
      }

      if (mediaInfo.type === r.type) score += 15;
      if (r.href.indexOf('/movies/') !== -1 || r.href.indexOf('/series/') !== -1 || r.href.indexOf('/tvshows/') !== -1) {
        score += 5;
      }
      return { href: r.href, title: r.title, year: r.year, type: r.type, score: score };
    }).sort(function (a, b) { return b.score - a.score; });

    var best = scored[0];
    if (!best || best.score < 40) {
      if (results.length > 0 && mediaInfo.type === 'movie' && mediaInfo.year) {
        return null;
      }
      return createHdmoziUrl(mediaInfo, season, episode);
    }

    var finalUrl = normalizeHttpUrl(best.href, HDMOZI_BASE);
    if (mediaInfo.type === 'series' && season && episode) {
      var trimmed = finalUrl.replace(/\/$/, '');
      var segs = trimmed.split('/');
      var lastSeg = segs[segs.length - 1] || '';
      var seriesSlug;

      if (trimmed.indexOf('/series/') !== -1 || trimmed.indexOf('/tvshows/') !== -1) {
        seriesSlug = lastSeg;
      } else if (trimmed.indexOf('/episodes/') !== -1) {
        var mSlug = lastSeg.match(/(.+)-\d+x\d+$/);
        seriesSlug = mSlug ? mSlug[1] : lastSeg;
      } else {
        return createHdmoziUrl(mediaInfo, season, episode);
      }
      finalUrl = HDMOZI_BASE + '/episodes/' + seriesSlug + '-' + season + 'x' + episode + '/';
    }

    return finalUrl;
  } catch (_) {
    return createHdmoziUrl(mediaInfo, season, episode);
  }
}

function classifyEmbed(rawEmbed, outEmbeds, seen) {
  if (!rawEmbed || typeof rawEmbed !== 'string') return;
  var clean = normalizeHttpUrl(decodeHtmlEntities(rawEmbed), HDMOZI_BASE);
  if (!clean) return;
  if (clean.indexOf('youtube.com') !== -1 || clean.indexOf('googletagmanager') !== -1) return;
  if (!seen[clean]) {
    seen[clean] = true;
    outEmbeds.push(clean);
  }
}

async function extractDooPlayerEmbeds(hdmoziUrl, html, outEmbeds, seen) {
  var postIdMatch =
    html.match(/data-post\s*=\s*['"](\d+)['"]/i) ||
    html.match(/post_id['"]\s*:\s*['"]*(\d+)['"]*/i) ||
    html.match(/"post"\s*:\s*(\d+)/) ||
    html.match(/wp-post-(\d+)/i);
  if (!postIdMatch) return;

  var postId = postIdMatch[1];
  var adminAjaxUrl = null;
  var restApiUrl = null;
  var playMethod = null;

  try {
    var dtAjaxBlock = html.match(/var\s+dtAjax\s*=\s*(\{[\s\S]*?\})\s*;/i) || html.match(/dtAjax\s*=\s*(\{[\s\S]*?\})/i);
    if (dtAjaxBlock && dtAjaxBlock[1]) {
      var parsedAjax = JSON.parse(dtAjaxBlock[1].replace(/\\\//g, '/'));
      adminAjaxUrl = parsedAjax.url || null;
      restApiUrl = parsedAjax.player_api || null;
      playMethod = parsedAjax.play_method ? String(parsedAjax.play_method).toLowerCase() : null;
    }
  } catch (_) {}

  var apiUrl = null;
  if (playMethod && playMethod.indexOf('admin') !== -1 && adminAjaxUrl) {
    apiUrl = normalizeHttpUrl(adminAjaxUrl, HDMOZI_BASE);
  } else if (restApiUrl) {
    apiUrl = normalizeHttpUrl(restApiUrl, HDMOZI_BASE);
  }
  if (!apiUrl) apiUrl = HDMOZI_BASE + '/wp-admin/admin-ajax.php';

  var dooType = /\/episodes\//.test(hdmoziUrl) ? 'tv' : 'movie';
  var typeMatch = html.match(/player-option[^>]*data-type=['"](\w+)['"]/i);
  if (typeMatch) dooType = typeMatch[1];

  var nums = [];
  var reNume = /player-option[^>]*data-nume=['"](\d+)['"]/gi;
  var nm;
  while ((nm = reNume.exec(html)) !== null) {
    if (nums.indexOf(nm[1]) === -1) nums.push(nm[1]);
  }
  if (nums.length === 0) nums = ['1', '2', '3'];

  await Promise.all(nums.slice(0, 4).map(async function (nume) {
    try {
      var res;
      if (apiUrl.indexOf('admin-ajax.php') !== -1) {
        var body = encodeForm({
          action: 'doo_player_ajax',
          post: postId,
          nume: nume,
          type: dooType
        });
        res = await fetchText(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Referer: hdmoziUrl,
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: body
        }, 4500);
      } else {
        var target = apiUrl.replace(/\/$/, '') + '/' + postId + '/' + dooType + '/' + nume;
        res = await fetchText(target, {
          headers: {
            Referer: hdmoziUrl,
            Accept: 'application/json'
          }
        }, 4500);
      }

      if (!res || !res.ok || !res.text) return;
      var embed = res.text;
      try {
        var j = JSON.parse(res.text);
        if (j && j.embed_url) embed = j.embed_url;
      } catch (_) {}

      if (/^\s*</.test(embed)) {
        var ifm = embed.match(/src=["']([^"']+)["']/i);
        if (ifm) classifyEmbed(ifm[1], outEmbeds, seen);
      } else {
        classifyEmbed(embed, outEmbeds, seen);
      }
    } catch (_) {}
  }));
}

async function fetchHdmoziPageAndEmbeds(hdmoziUrl, meta) {
  var resp = await fetchText(hdmoziUrl, { headers: { Referer: HDMOZI_BASE + '/' } }, 5000);
  if (!resp || !resp.ok || !resp.text) {
    var epMatch = hdmoziUrl.match(/\/episodes\/([^/]+)-(\d+)x(\d+)\/?$/);
    if (resp && resp.status === 404 && epMatch) {
      var slugNoYear = epMatch[1].replace(/-\d{4}$/, '');
      if (slugNoYear !== epMatch[1]) {
        var noYearUrl = HDMOZI_BASE + '/episodes/' + slugNoYear + '-' + epMatch[2] + 'x' + epMatch[3] + '/';
        return await fetchHdmoziPageAndEmbeds(noYearUrl, meta);
      }
    }
    return [];
  }

  var html = resp.text;
  var isSeries = meta.type === 'series' || Boolean(meta.season && meta.episode);
  if (!isSeries) {
    var pageCheck = checkPageMetadata(html, meta);
    if (!pageCheck.match) return [];
  }

  var outEmbeds = [];
  var seen = {};
  var ifRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
  var m;
  while ((m = ifRe.exec(html)) !== null) {
    classifyEmbed(m[1], outEmbeds, seen);
  }

  await extractDooPlayerEmbeds(hdmoziUrl, html, outEmbeds, seen);
  return outEmbeds;
}

async function resolveHdmoziEmbed(embedUrl, title, meta) {
  var lower = embedUrl.toLowerCase();

  var rpmMatch = embedUrl.match(/(?:rpmshare\.rpmstream\.live|rpmstream\.live|rpmvid\.com)\/#([a-zA-Z0-9_-]+)/i);
  if (rpmMatch) {
    return await extractRpmStream(rpmMatch[1], HDMOZI_BASE + '/', 'HDMozi', title, 'Magyar Szinkron');
  }

  if (lower.indexOf('videa.hu') !== -1 || lower.indexOf('videakid.hu') !== -1) {
    var vInfo = await extractVideaInfo(embedUrl);
    if (!vInfo || !vInfo.sources || vInfo.sources.length === 0) return [];
    if (!isValidRuntime(vInfo.duration, meta)) return [];
    var out = [];
    for (var i = 0; i < vInfo.sources.length; i++) {
      var vs = vInfo.sources[i];
      var s = buildNuvioStream({
        url: vs.url,
        provider: 'HDMozi',
        hoster: 'Videa',
        title: title,
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

  return await resolveAnyEmbed(embedUrl, 'HDMozi', title, meta, 'Magyar Szinkron');
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var budget = createBudget(45000);
    var meta = await resolveMediaMeta(tmdbId, mediaType, season, episode);
    if (!meta) return [];

    var rawTitle = String(meta.hungarianTitle || meta.englishTitle || '').replace(/\+/g, ' ').trim();
    if (!rawTitle) return [];

    var isSeries = meta.type === 'series' || Boolean(meta.season && meta.episode);
    var mediaInfo = {
      title: rawTitle,
      type: isSeries ? 'series' : 'movie',
      year: meta.year ? parseInt(meta.year, 10) : null
    };

    var hdmoziUrl = await resolveHdmoziUrl(mediaInfo, meta.season, meta.episode);
    if (!hdmoziUrl && meta.englishTitle && !budget.expired(5000)) {
      var engTitle = String(meta.englishTitle).replace(/\+/g, ' ').trim();
      if (engTitle && engTitle !== rawTitle) {
        mediaInfo.title = engTitle;
        hdmoziUrl = await resolveHdmoziUrl(mediaInfo, meta.season, meta.episode);
      }
    }

    if (!hdmoziUrl || budget.expired(4000)) return [];

    var embeds = await fetchHdmoziPageAndEmbeds(hdmoziUrl, meta);
    if (embeds.length === 0) return [];

    var settled = await Promise.allSettled(
      embeds.slice(0, 6).map(function (emb) {
        return resolveHdmoziEmbed(emb, rawTitle, meta);
      })
    );

    var streams = [];
    for (var i = 0; i < settled.length; i++) {
      if (settled[i].status === 'fulfilled' && Array.isArray(settled[i].value)) {
        for (var j = 0; j < settled[i].value.length; j++) {
          streams.push(settled[i].value[j]);
        }
      }
    }

    return finalizeStreams(streams);
  } catch (_) {
    return [];
  }
}

module.exports = {
  getStreams: getStreams
};
