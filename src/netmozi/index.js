'use strict';

var { stringToBase64, normalizeHttpUrl } = require('../_shared/bytes');
var {
  createBudget,
  fetchText,
  getHeader,
  getSetting,
  resolveRedirectUrl
} = require('../_shared/http');
var { resolveNetMoziContent, unpackNetMoziPayload } = require('../_shared/crypto_decoders');
var { escapeRegExp, normalizeTitle, resolveMediaMeta } = require('../_shared/meta');
var {
  finalizeStreams,
  isDownloadOnlyHost,
  resolveAnyEmbed
} = require('../_shared/hosters');

function mergeCookies(headers, jar) {
  if (!headers || !jar) return;
  var raw = getHeader(headers, 'set-cookie');
  if (!raw) return;
  var parts = String(raw).split(',');
  for (var i = 0; i < parts.length; i++) {
    var seg = parts[i].split(';')[0].trim();
    var eq = seg.indexOf('=');
    if (eq > 0) {
      jar[seg.slice(0, eq).trim()] = seg.slice(eq + 1).trim();
    }
  }
}

function formatCookieHeader(jar) {
  var pairs = [];
  for (var k in jar) {
    if (Object.prototype.hasOwnProperty.call(jar, k) && jar[k]) {
      pairs.push(k + '=' + jar[k]);
    }
  }
  return pairs.join('; ');
}

function buildNetMoziHeaders(extra, cookieJar) {
  var h = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7'
  };
  var userCookie = getSetting('netmoziCookie', '');
  var jarCookie = formatCookieHeader(cookieJar);
  var combinedCookie = [userCookie, jarCookie].filter(Boolean).join('; ');
  if (combinedCookie) h.Cookie = combinedCookie;
  if (extra) {
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
    }
  }
  return h;
}

function scoreCandidateCard(itemTitle, itemYear, itemLink, itemIsSeries, isSeries, normTarget, targetYear) {
  var normItem = normalizeTitle(itemTitle);
  if (!normItem) return null;

  var safeTarget = escapeRegExp(normTarget);
  var safeItem = escapeRegExp(normItem);
  var isWordMatch = normTarget.length <= 3
    ? new RegExp('(?:^|\\s)' + safeTarget + '(?:\\s|$)', 'i').test(normItem)
    : (new RegExp('(?:^|\\s)' + safeTarget + '(?:\\s|$)', 'i').test(normItem) ||
       (normItem.length > 3 && new RegExp('(?:^|\\s)' + safeItem + '(?:\\s|$)', 'i').test(normTarget)));
  var matchScore = normItem === normTarget ? 100 : (isWordMatch ? 75 : 0);
  if (matchScore <= 0) return null;

  if (isSeries === false && targetYear && itemYear && Math.abs(parseInt(targetYear, 10) - parseInt(itemYear, 10)) > 1) {
    return null;
  }

  var yearScore = (targetYear && itemYear && Math.abs(parseInt(targetYear, 10) - parseInt(itemYear, 10)) <= 1) ? 40 : 0;
  var typeScore = 0;
  if (isSeries === true) typeScore = itemIsSeries ? 30 : -20;
  else if (isSeries === false) typeScore = !itemIsSeries ? 20 : -10;

  var midMatch = itemLink.match(/\/(?:sorozatok|adatlap|filmek|film)\/(\d+)/i);
  return {
    title: itemTitle,
    year: itemYear,
    link: itemLink,
    isSeries: itemIsSeries,
    mid: midMatch ? midMatch[1] : '',
    score: matchScore + yearScore + typeScore
  };
}

function parseCandidatesFromHtml(html, isSeries, normTarget, targetYear) {
  var candidates = [];
  if (!html) return candidates;

  // 1. Modern SSR cards (<article class="movie-card">)
  var articleRe = /<article[^>]*class=["'][^"']*movie-card[^"']*["'][\s\S]*?<\/article>/gi;
  var m;
  while ((m = articleRe.exec(html)) !== null) {
    var cardStr = m[0];
    var linkMatch = cardStr.match(/href=["'](\/(?:adatlap|sorozatok|filmek|film)\/[^"']+)["']/i);
    var titleMatch = cardStr.match(/<h3[^>]*class=["']movie-title["'][^>]*>([\s\S]*?)<\/h3>/i);
    if (linkMatch && titleMatch) {
      var yearMatch = cardStr.match(/Év:[\s\S]*?([0-9]{4})/i);
      var itemTitle = titleMatch[1].replace(/<[^>]+>/g, '').replace('(sorozat)', '').trim();
      var itemIsSeries = cardStr.indexOf('(sorozat)') !== -1 || cardStr.indexOf('/sorozatok/') !== -1 || cardStr.indexOf('évad') !== -1;
      var cand = scoreCandidateCard(itemTitle, yearMatch ? yearMatch[1] : '', linkMatch[1], itemIsSeries, isSeries, normTarget, targetYear);
      if (cand) candidates.push(cand);
    }
  }
  if (candidates.length > 0) return candidates;

  // 2. Classic cards (<div class="col-12">)
  var classicRe = /<div[^>]*class=["']col-12[\s\S]*?(?=<div[^>]*class=["']col-12|$)/gi;
  while ((m = classicRe.exec(html)) !== null) {
    var cStr = m[0];
    var cTitle = cStr.match(/class=["']col_name["'][^>]*>([\s\S]*?)<\/div>/i);
    var cLink = cStr.match(/href=["']([^"']+)["'][^>]*class=["']col_a["']/i);
    if (cTitle && cLink) {
      var cYear = cStr.match(/Év:[\s\S]*?([0-9]{4})/i);
      var t = cTitle[1].replace(/<[^>]+>/g, '').replace('(sorozat)', '').trim();
      var ser = cStr.indexOf('(sorozat)') !== -1 || cLink[1].indexOf('/sorozatok/') !== -1;
      var cObj = scoreCandidateCard(t, cYear ? cYear[1] : '', cLink[1], ser, isSeries, normTarget, targetYear);
      if (cObj) candidates.push(cObj);
    }
  }

  return candidates;
}

function getHostPriority(host) {
  var h = String(host || '').toLowerCase();
  if (!h || isDownloadOnlyHost(h)) return -1;
  if (/dood\.|doods\.|doodstream\.|savefiles\.|playmogo\.|vidnest\./.test(h)) return -1;
  // Direct device execution: ALL open + IP/ASN hosters unlocked (VOE, Vidmoly, Filemoon/Byse, StreamRuby, etc.)
  if (/rubystm\.|streamruby\.|nuvorel\.|vtbe\.to|luluvid\.|luluvdo\.|lulustream\.|mxdrop\.|mixdrop\./.test(h)) return 0;
  if (/voe\.|vidmoly\.|vidara\.|bysesayeveum\.|byselapuix\.|bysetayico\.|byse\.|filemoon\.|ok\.ru|videa\.|indavideo\./.test(h)) return 1;
  return 2;
}

function getHosterFamily(host) {
  var h = String(host || '').toLowerCase();
  if (/rubystm\.|streamruby\.|nuvorel\./.test(h)) return 'streamruby';
  if (/bysesayeveum\.|byselapuix\.|bysetayico\.|byse\.|filemoon\./.test(h)) return 'filemoon';
  if (/mxdrop\.|mixdrop\./.test(h)) return 'mixdrop';
  if (/luluvid\.|luluvdo\.|lulustream\./.test(h)) return 'luluvid';
  if (/vidmoly\./.test(h)) return 'vidmoly';
  if (/voe\./.test(h)) return 'voe';
  if (/vidara\./.test(h)) return 'vidara';
  if (/vtbe\./.test(h)) return 'vtube';
  return h;
}

function parseMindjartRows(html) {
  var candidates = [];
  if (!html) return candidates;

  var rowRe = /<tr\b([^>]*)data-link-row([^>]*)>([\s\S]*?)<\/tr>/gi;
  var m;
  while ((m = rowRe.exec(html)) !== null) {
    var attrStr = (m[1] || '') + ' ' + (m[2] || '');
    var body = m[3] || '';
    if (body.indexOf('red_mark.png') !== -1) continue;
    if (body.indexOf('Letöltő link') !== -1 || body.indexOf('diablo-lang') !== -1) continue;

    var linkType = (attrStr.match(/data-link-type=["']([^"']+)["']/i) || [])[1] || '';
    if (linkType.toLowerCase() === 'download') continue;

    var routeMatch = body.match(/href=["'](\/links\/open\/\d+)["']/i);
    if (!routeMatch) continue;

    var linkLang = ((attrStr.match(/data-link-language=["']([^"']+)["']/i) || [])[1] || '').toLowerCase();
    var linkHost = ((attrStr.match(/data-link-host=["']([^"']+)["']/i) || [])[1] || '').toLowerCase();
    var rowHostText = ((body.match(/col-host[^>]*>([^<]+)/i) || [])[1] || '').trim().toLowerCase();
    var host = linkHost || rowHostText;

    var tier = getHostPriority(host);
    if (tier < 0) continue;

    var langLabel = 'Külföldi';
    var langRank = 2;
    if (linkLang === 'dubbed' || body.indexOf('hungary.gif') !== -1 || /magyar szinkron/i.test(body)) {
      langLabel = 'Magyar Szinkron';
      langRank = 0;
    } else if (linkLang === 'sub' || body.indexOf('uk-hu.png') !== -1 || /felirat/i.test(body)) {
      langLabel = 'Magyar Felirat';
      langRank = 1;
    }

    candidates.push({
      route: routeMatch[1],
      host: host,
      family: getHosterFamily(host),
      tier: tier,
      langLabel: langLabel,
      langRank: langRank,
      hasAlert: body.indexOf('alert_icon.png') !== -1
    });
  }

  if (candidates.length > 0) {
    candidates.sort(function (a, b) {
      if (a.langRank !== b.langRank) return a.langRank - b.langRank;
      if (a.hasAlert !== b.hasAlert) return a.hasAlert ? 1 : -1;
      return a.tier - b.tier;
    });

    var selected = [];
    var familyCounts = {};
    var seenRoutes = {};
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (seenRoutes[c.route]) continue;
      var count = familyCounts[c.family] || 0;
      if (count >= 2) continue;
      seenRoutes[c.route] = true;
      familyCounts[c.family] = count + 1;
      selected.push(c);
      if (selected.length >= 10) break;
    }
    return selected;
  }

  var seen = {};
  var linkRe = /href=["'](\/links\/open\/\d+)["']/g;
  while ((m = linkRe.exec(html)) !== null) {
    if (!seen[m[1]]) {
      seen[m[1]] = true;
      candidates.push({
        route: m[1],
        host: '',
        family: 'unknown',
        tier: 2,
        langLabel: 'Magyar Szinkron',
        langRank: 0,
        hasAlert: false
      });
    }
  }

  if (candidates.length === 0) {
    var mPayload = html.match(/<script[^>]*data-link-payload[^>]*data-link-context="([^"]+)"[^>]*>([\s\S]*?)<\/script>/);
    if (mPayload) {
      try {
        var routes = unpackNetMoziPayload(JSON.parse(mPayload[2]).value, mPayload[1]);
        for (var j = 0; j < routes.length; j++) {
          var r = routes[j];
          if (r && r.indexOf('////diablo') !== 0 && r.indexOf('////torrent') !== 0 && !seen[r]) {
            seen[r] = true;
            candidates.push({
              route: r,
              host: '',
              family: 'unknown',
              tier: 2,
              langLabel: 'Magyar Szinkron',
              langRank: 0,
              hasAlert: false
            });
          }
        }
      } catch (_) {}
    }
  }

  return candidates.slice(0, 8);
}

async function resolveMindjartHtml(html, mindjartUrl, cleanTitle, meta, cookieJar, budget) {
  var rowCandidates = parseMindjartRows(html);
  if (rowCandidates.length === 0) return [];

  var resolvedTargets = [];
  var seenEmbeds = {};

  for (var i = 0; i < rowCandidates.length; i++) {
    if (budget.expired(12000)) break;
    var item = rowCandidates[i];
    var fullUrl = /^https?:\/\//i.test(item.route) ? item.route : ('https://mindjart.megnezed.com' + item.route);
    var loc = await resolveRedirectUrl(fullUrl, {
      headers: buildNetMoziHeaders({ Referer: mindjartUrl }, cookieJar)
    }, 5000);
    if (loc && !seenEmbeds[loc] && !isDownloadOnlyHost(loc)) {
      seenEmbeds[loc] = true;
      resolvedTargets.push({ embedUrl: loc, rowMeta: item });
    }
  }

  var streams = [];
  for (var j = 0; j < resolvedTargets.length; j++) {
    if (budget.expired(3000)) break;
    var target = resolvedTargets[j];
    var targetEmbed = normalizeHttpUrl(target.embedUrl);
    var vmWatch = targetEmbed.match(/^https?:\/\/(?:www\.)?vidmoly\.[a-z]+\/(?:v|w)\/([a-zA-Z0-9]+)/i);
    if (vmWatch) targetEmbed = 'https://vidmoly.biz/embed-' + vmWatch[1] + '.html';

    var embeddedStreams = await resolveAnyEmbed(
      targetEmbed,
      'NetMozi',
      cleanTitle,
      meta,
      target.rowMeta.langLabel
    );
    for (var s = 0; s < embeddedStreams.length; s++) {
      streams.push(embeddedStreams[s]);
    }
  }

  return streams;
}

async function scrapeMindjartDirect(movieId, isSeries, season, episode, cleanTitle, meta, cookieJar, budget) {
  if (!movieId || budget.expired(8000)) return [];
  var b64 = stringToBase64(String(movieId));
  var s = season || 1;
  var e = episode || 1;
  var mindjartUrl = (isSeries && season && episode)
    ? 'https://mindjart.megnezed.com/links/vv/' + b64 + '/' + s + '/' + e
    : 'https://mindjart.megnezed.com/links/vv/' + b64;

  var pageRes = await fetchText(mindjartUrl, {
    headers: buildNetMoziHeaders({ Referer: 'https://netmozi.com/' }, cookieJar)
  }, 6000);
  if (!pageRes || !pageRes.ok || !pageRes.text) return [];
  mergeCookies(pageRes.headers, cookieJar);
  return await resolveMindjartHtml(pageRes.text, mindjartUrl, cleanTitle, meta, cookieJar, budget);
}

async function scrapeNetMoziDetailPage(targetPageUrl, cleanTitle, meta, cookieJar, season, episode, budget) {
  var urlMidMatch = targetPageUrl.match(/\/(?:sorozatok|adatlap|filmek|film)\/(\d+)/i);
  var urlSMatch = targetPageUrl.match(/\/s(\d+)\/e(\d+)/i);
  var urlMid = urlMidMatch ? urlMidMatch[1] : null;
  var urlS = season || (urlSMatch ? parseInt(urlSMatch[1], 10) : null);
  var urlE = episode || (urlSMatch ? parseInt(urlSMatch[2], 10) : null);
  var urlIsSeries = Boolean(urlS && urlE) || targetPageUrl.indexOf('/sorozatok/') !== -1;

  if (urlMid) {
    var direct = await scrapeMindjartDirect(urlMid, urlIsSeries, urlS, urlE, cleanTitle, meta, cookieJar, budget);
    if (direct.length > 0) return direct;
  }

  if (budget.expired(8000)) return [];
  var detailRes = await fetchText(targetPageUrl, {
    headers: buildNetMoziHeaders({ Referer: 'https://netmozi.com/' }, cookieJar)
  }, 6500);
  if (!detailRes || !detailRes.ok || !detailRes.text) return [];
  mergeCookies(detailRes.headers, cookieJar);

  var attrs = {};
  var attrRe = /(data-movie-id|data-token|data-csrf|data-season|data-episode)="([^"]*)"/g;
  var am;
  while ((am = attrRe.exec(detailRes.text)) !== null) {
    attrs[am[1]] = am[2];
  }

  var movieId = attrs['data-movie-id'];
  var csrf = attrs['data-csrf'];
  var token = attrs['data-token'] || '';
  if (!movieId || !csrf) return [];

  var s = season || attrs['data-season'];
  var e = episode || attrs['data-episode'];
  var isSeries = Boolean(s && e);
  var postBody = isSeries
    ? 'token=' + encodeURIComponent(token) + '&season=' + s + '&episode=' + e
    : 'token=' + encodeURIComponent(token);

  var loadLinksRes = await fetchText('https://netmozi.com/details/loadLinks/' + movieId + csrf, {
    method: 'POST',
    headers: buildNetMoziHeaders({
      Referer: targetPageUrl,
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    }, cookieJar),
    body: postBody
  }, 6000);
  if (!loadLinksRes || !loadLinksRes.ok || !loadLinksRes.text) return [];

  var linksData;
  try {
    linksData = JSON.parse(loadLinksRes.text);
  } catch (_) {
    return [];
  }
  if (!linksData || !linksData.success) return [];

  var mindjartUrl = null;
  if (linksData.html) {
    var hrefM = linksData.html.match(/href="([^"]+)"/);
    if (hrefM) mindjartUrl = hrefM[1].replace(/\\/g, '');
  }
  if (!mindjartUrl && linksData.linkPayload && linksData.linkPayload.value) {
    var pages = unpackNetMoziPayload(linksData.linkPayload.value, token);
    if (pages.length > 0) mindjartUrl = pages[0];
  }
  if (!mindjartUrl) return [];

  var mindjartRes = await fetchText(mindjartUrl, {
    headers: buildNetMoziHeaders({ Referer: 'https://netmozi.com/' }, cookieJar)
  }, 6000);
  if (!mindjartRes || !mindjartRes.ok || !mindjartRes.text) return [];
  return await resolveMindjartHtml(mindjartRes.text, mindjartUrl, cleanTitle, meta, cookieJar, budget);
}

async function searchAndScrapeNetMozi(query, meta, isSeries, cookieJar, budget) {
  if (budget.expired(10000)) return [];
  var normTarget = normalizeTitle(query);
  var searchUrl = 'https://netmozi.com/?search=' + encodeURIComponent(query);
  var searchRes = await fetchText(searchUrl, { headers: buildNetMoziHeaders(null, cookieJar) }, 6500);
  if (!searchRes || !searchRes.text) return [];
  mergeCookies(searchRes.headers, cookieJar);

  var candidates = parseCandidatesFromHtml(searchRes.text, isSeries, normTarget, meta.year);
  if (candidates.length === 0) {
    var m = searchRes.text.match(/data-results-url="([^"]+)"\s+data-results-token="([^"]+)"/);
    if (m) {
      var resultsRes = await fetchText('https://netmozi.com' + m[1], {
        method: 'POST',
        headers: buildNetMoziHeaders({
          Referer: searchUrl,
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        }, cookieJar),
        body: 'token=' + encodeURIComponent(m[2])
      }, 6000);
      if (resultsRes && resultsRes.ok && resultsRes.text) {
        try {
          var data = JSON.parse(resultsRes.text);
          if (data && data.success && data.html && data.html.classic) {
            var resolvedHtml = resolveNetMoziContent(data.html.classic);
            candidates = parseCandidatesFromHtml(resolvedHtml, isSeries, normTarget, meta.year);
          }
        } catch (_) {}
      }
    }
  }

  if (candidates.length === 0) return [];
  candidates.sort(function (a, b) { return b.score - a.score; });
  var best = candidates[0];

  if (best.mid) {
    var directStreams = await scrapeMindjartDirect(best.mid, best.isSeries, meta.season || 1, meta.episode || 1, query, meta, cookieJar, budget);
    if (directStreams.length > 0) return directStreams;
  }

  var targetPageUrl = /^https?:\/\//i.test(best.link) ? best.link : ('https://netmozi.com' + best.link);
  if (best.isSeries) {
    targetPageUrl += '/s' + (meta.season || 1) + '/e' + (meta.episode || 1);
  }
  return await scrapeNetMoziDetailPage(targetPageUrl, query, meta, cookieJar, meta.season, meta.episode, budget);
}

async function scrapeNetMozi(meta) {
  if (!meta) return [];
  var budget = createBudget(45000);
  var cookieJar = {};

  // Fast-path: direct NetMozi custom ID (bypasses Cloudflare netmozi.com search)
  if (meta.imdbId && meta.imdbId.indexOf('netmozi:') === 0) {
    var parts = meta.imdbId.split(':');
    var itemType = parts[1] || 'movie';
    var mid = parts[2] || '';
    var isSer = itemType === 'series';
    var s = isSer ? (meta.season || 1) : null;
    var e = isSer ? (meta.episode || 1) : null;
    var label = meta.hungarianTitle || meta.englishTitle || 'NetMozi';
    if (parts.length >= 5 && /^\d+$/.test(parts[3]) && /^\d+$/.test(parts[4])) {
      s = parseInt(parts[3], 10);
      e = parseInt(parts[4], 10);
    }
    if (mid) {
      var directStreams = await scrapeMindjartDirect(mid, isSer, s, e, label, meta, cookieJar, budget);
      return finalizeStreams(directStreams);
    }
  }

  var cleanTitle = meta.hungarianTitle || meta.englishTitle;
  if (!cleanTitle) return [];

  var isSeries = meta.type === 'series' || Boolean(meta.season && meta.episode);
  var strippedHu = cleanTitle.replace(/\s*[-–:]\s*(a film|the movie|film|sorozat)\s*$/i, '').trim();
  var strippedEn = (meta.englishTitle || '').replace(/\s*[-–:]\s*(a film|the movie|film|sorozat)\s*$/i, '').trim();

  var queryList = [];
  var addQ = function (q) {
    if (q && queryList.indexOf(q) === -1) queryList.push(q);
  };
  addQ(strippedHu);
  addQ(cleanTitle);
  addQ(strippedEn);
  addQ(meta.englishTitle);

  for (var i = 0; i < queryList.length; i++) {
    if (budget.expired(8000)) break;
    var streams = await searchAndScrapeNetMozi(queryList[i], meta, isSeries, cookieJar, budget);
    if (streams.length > 0) return finalizeStreams(streams);
  }

  return [];
}

async function getStreams(tmdbId, mediaType, season, episode) {
  var meta = await resolveMediaMeta(tmdbId, mediaType, season, episode);
  if (!meta) return [];
  return await scrapeNetMozi(meta);
}

module.exports = { getStreams: getStreams, scrapeNetMozi: scrapeNetMozi, parseMindjartRows: parseMindjartRows };
