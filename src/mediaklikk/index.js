'use strict';

var { decodeHtmlEntities } = require('../_shared/bytes');
var { UA, createBudget, fetchText } = require('../_shared/http');
var { resolveMediaMeta, normalizeTitle, escapeRegExp } = require('../_shared/meta');
var { buildNuvioStream, finalizeStreams } = require('../_shared/hosters');

var SEARCH_API_URL = 'https://mediaklikk.hu/wp-content/plugins/hms-mediaklikk/interfaces/get_results.php';
var PLAYER_BASE_URL = 'https://player.mediaklikk.hu/playernew/player.php?video=';
var HLS_HEADERS = {
  Referer: 'https://mediaklikk.hu/',
  Origin: 'https://mediaklikk.hu',
  'User-Agent': UA
};

var LIVE_CHANNELS = [
  { id: 'mediaklikk-live-m4', channelKey: 'm4', streamId: 'mtv4live', name: 'M4 Sport Élő' },
  { id: 'mediaklikk-live-m4plus', channelKey: 'm4plus', streamId: 'mtv4plus', name: 'M4 Sport+ Élő' },
  { id: 'mediaklikk-live-m1', channelKey: 'm1', streamId: 'mtv1live', name: 'M1 Híradó Élő' },
  { id: 'mediaklikk-live-m2', channelKey: 'm2', streamId: 'mtv2live', name: 'M2 Gyerek & Petőfi TV Élő' },
  { id: 'mediaklikk-live-m5', channelKey: 'm5', streamId: 'mtv5live', name: 'M5 Kultúra Élő' },
  { id: 'mediaklikk-live-duna', channelKey: 'duna', streamId: 'dunalive', name: 'Duna TV Élő' },
  { id: 'mediaklikk-live-dunaworld', channelKey: 'dunaworld', streamId: 'dunaworldlive', name: 'Duna World Élő' }
];

var VERIFIED_MEDIAKLIKK_CLASSICS = [
  { slug: 'a-nagy-ho-ho-ho-horgasz', imdbId: 'tt0154077', name: 'A nagy ho-ho-ho-horgász', keyword: 'A nagy ho-ho-ho', matchWord: 'a nagy ho ho ho horgasz' },
  { slug: 'magyar-nepmesek', imdbId: 'tt0861751', name: 'Magyar népmesék', keyword: 'Magyar népmesék', matchWord: 'magyar nepmesek' },
  { slug: 'pom-pom-mesei', imdbId: 'tt0166931', name: 'Pom-Pom meséi', keyword: 'Pom-Pom meséi', matchWord: 'pom pom mesei' },
  { slug: 'frakk-a-macskak-reme', imdbId: 'tt0167595', name: 'Frakk, a macskák réme', keyword: 'Frakk, a macskák réme', matchWord: 'frakk' },
  { slug: 'kukori-es-kotkoda', imdbId: 'tt0168342', name: 'Kukori és Kotkoda', keyword: 'Kukori és Kotkoda', matchWord: 'kukori' },
  { slug: 'vizipok-csodapok', imdbId: 'tt0168393', name: 'Vízipók-csodapók', keyword: 'Vízipók-csodapók', matchWord: 'vizipok' },
  { slug: 'kerem-a-kovetkezot', imdbId: 'tt0168343', name: 'Kérem a következőt! (Dr. Bubó)', keyword: 'Kérem a következőt!', matchWord: 'kerem a kovetkezot' },
  { slug: 'uzenet-a-jovobol-a-mezga-csalad', imdbId: 'tt0136650', name: 'Üzenet a jövőből – A Mézga család', keyword: 'Üzenet a jövőből', matchWord: 'uzenet a jovobol' },
  { slug: 'mezga-aladar-kulonos-kalandjai', imdbId: 'tt0136650', name: 'Mézga Aladár különös kalandjai', keyword: 'Mézga Aladár különös kalandjai', matchWord: 'mezga aladar' },
  { slug: 'vuk', imdbId: 'tt0131636', name: 'Vuk (1–4. rész)', keyword: 'Vuk', matchWord: 'vuk' },
  { slug: 'a-kockasfulu-nyul', name: 'A kockásfülű nyúl', keyword: 'A kockásfülű nyúl', matchWord: 'a kockasfulu nyul' },
  { slug: 'mazsola-es-tade', name: 'Mazsola és Tádé', keyword: 'Mazsola és Tádé', matchWord: 'mazsola es tade' },
  { slug: 'sebaj-tobias', name: 'Sebaj Tóbiás', keyword: 'Sebaj Tóbiás', matchWord: 'sebaj tobias' },
  { slug: 'mesek-matyas-kiralyrol', name: 'Mesék Mátyás királyról', keyword: 'Mesék Mátyás királyról', matchWord: 'mesek matyas kiralyrol' },
  { slug: 'egbolpottyant-mesek', name: 'Égbőlpottyant mesék', keyword: 'Égbőlpottyant mesék', matchWord: 'egbolpottyant mesek' },
  { slug: 'toldi', name: 'Toldi', keyword: 'Toldi', matchWord: 'toldi' },
  { slug: 'mekk-elek-az-ezermester', imdbId: 'tt0168350', name: 'Mekk Elek, az ezermester', keyword: 'Mekk Elek az ezermester', matchWord: 'mekk elek' },
  { slug: 'mirr-murr-kandur-kalandjai', name: 'Mirr-Murr kandúr kalandjai', keyword: 'Mirr-Murr', matchWord: 'mirr murr' },
  { slug: 'a-legkisebb-ugrifules', name: 'A legkisebb Ugrifüles', keyword: 'A legkisebb Ugrifüles', matchWord: 'a legkisebb ugrifules' },
  { slug: 'tof-tof-elefant', name: 'Töf-Töf elefánt', keyword: 'Töf-Töf elefánt', matchWord: 'tof tof' },
  { slug: 'dormogoek-kalandjai', name: 'Dörmögőék kalandjai', keyword: 'Dörmögőék', matchWord: 'dormogoek' },
  { slug: 'a-kiscsacsi-kalandjai', name: 'A Kiscsacsi kalandjai', keyword: 'A Kiscsacsi kalandjai', matchWord: 'a kiscsacsi' },
  { slug: 'trombi-es-a-tuzmano', name: 'Trombi és a Tűzmanó', keyword: 'Trombi és a Tűzmanó', matchWord: 'trombi' },
  { slug: 'mikrobi', name: 'Mikrobi', keyword: 'Mikrobi', matchWord: 'mikrobi' },
  { slug: 'benedek-elek-mesei', name: 'Benedek Elek meséi', keyword: 'Benedek Elek meséi', matchWord: 'benedek elek' },
  { slug: 'a-tenkes-kapitanya', imdbId: 'tt0056789', name: 'A Tenkes kapitánya', keyword: 'A Tenkes kapitánya', matchWord: 'a tenkes kapitanya' },
  { slug: 'szomszedok', imdbId: 'tt0149529', name: 'Szomszédok', keyword: 'Szomszédok', matchWord: 'szomszedok' },
  { slug: 'familia-kft', name: 'Família Kft.', keyword: 'Família Kft.', matchWord: 'familia kft' },
  { slug: 'linda', imdbId: 'tt0149483', name: 'Linda', keyword: 'Linda', matchWord: 'linda' },
  { slug: 'eletkepek', name: 'Életképek', keyword: 'Életképek', matchWord: 'eletkepek' }
];

var showEpisodesCache = {};

function encodeForm(obj) {
  var parts = [];
  for (var k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(obj[k])));
    }
  }
  return parts.join('&');
}

function sanitizeSlug(rawSlug) {
  var parts = String(rawSlug || '').replace(/^mediaklikk:program:/, '').split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

function decodeToken(token) {
  var clean = String(token || '').trim();
  while (clean.indexOf('%') !== -1) {
    try {
      var next = decodeURIComponent(clean);
      if (next === clean) break;
      clean = next;
    } catch (_) {
      break;
    }
  }
  return clean;
}

function romanToInt(sStr) {
  var map = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
  var upper = String(sStr || '').toUpperCase();
  return map[upper] || parseInt(sStr, 10) || 1;
}

function parseSeasonEpisode(title) {
  var s = null;
  var e = null;

  var slashMatch = String(title || '').match(/\b(I{1,3}|IV|VI{0,3}|IX|X|\d+)\s*\/\s*(\d+)/i);
  if (slashMatch) {
    s = romanToInt(slashMatch[1]);
    e = parseInt(slashMatch[2], 10);
  }

  if (s === null) {
    var sMatch = String(title || '').match(/\b(I{1,3}|IV|VI{0,3}|IX|X|\d+)\.\s*(sorozat|evad|évad|széria|szeria)/i);
    if (sMatch) s = romanToInt(sMatch[1]);
  }

  if (e === null) {
    var eMatch = String(title || '').match(/(\d+)\.\s*(?:rész|resz|epizód|epizod|fejezet)/i);
    if (eMatch) e = parseInt(eMatch[1], 10);
  }

  return { season: s, episode: e };
}

async function resolvePlayerM3u8(videoIdOrToken) {
  var token = decodeToken(videoIdOrToken);
  if (!token) return null;
  var playerUrl = PLAYER_BASE_URL + encodeURIComponent(token);
  var res = await fetchText(playerUrl, { headers: { Referer: 'https://mediaklikk.hu/' } }, 5000);
  if (!res || !res.ok || !res.text) return null;

  var m3u8Match = res.text.match(/"file":\s*"([^"]+\.m3u8[^"]*)"/i);
  if (!m3u8Match) return null;
  return m3u8Match[1].replace(/\\\//g, '/');
}

async function searchMediaKlikkItems(keyword, pageSize) {
  var body = encodeForm({
    action: 'search',
    s_type: 'video',
    keyword: keyword,
    fromDate: '2013-01-01',
    toDate: '2027-12-31',
    pageSize: String(pageSize || 50),
    pageNumber: '1',
    getAudioPrograms: 'false'
  });

  var res = await fetchText(SEARCH_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: 'https://mediaklikk.hu/talalati-lista/?search_mk=' + encodeURIComponent(keyword)
    },
    body: body
  }, 4500);

  if (!res || !res.ok || !res.text) return [];
  try {
    var data = JSON.parse(res.text);
    return (data && data[0] && data[0].data && Array.isArray(data[0].data.items)) ? data[0].data.items : [];
  } catch (_) {
    return [];
  }
}

async function getProgramEpisodes(slugOrId) {
  var cleanKey = sanitizeSlug(slugOrId);
  if (!cleanKey) return null;

  var cached = showEpisodesCache[cleanKey];
  if (cached && Date.now() - cached.ts < 2 * 60 * 60 * 1000) {
    return cached.data;
  }

  var verified = null;
  for (var i = 0; i < VERIFIED_MEDIAKLIKK_CLASSICS.length; i++) {
    var c = VERIFIED_MEDIAKLIKK_CLASSICS[i];
    if (c.slug === cleanKey || c.imdbId === cleanKey || normalizeTitle(c.name) === normalizeTitle(cleanKey)) {
      verified = c;
      break;
    }
  }

  var program = verified || {
    slug: cleanKey,
    name: cleanKey.replace(/-/g, ' '),
    keyword: cleanKey.replace(/-/g, ' '),
    matchWord: normalizeTitle(cleanKey.replace(/-/g, ' '))
  };

  var items = await searchMediaKlikkItems(program.keyword || program.name, 50);
  var normProgName = normalizeTitle(program.matchWord || program.name);
  var seasonsMap = {};
  var seenEpNames = {};

  for (var idx = 0; idx < items.length; idx++) {
    var item = items[idx];
    var rawTitle = decodeHtmlEntities(String(item.post_title || (item.source && item.source.post_title) || '').replace(/<[^>]+>/g, '').trim());
    var token = item.token || (item.source && item.source.token);
    if (!token || !rawTitle) continue;

    var normTitle = normalizeTitle(rawTitle);
    if (normTitle.indexOf('csillagok esti mesefenyben') !== -1 ||
        normTitle.indexOf('ismeretlen ismerosok') !== -1 ||
        normTitle.indexOf('debrecenbol jelentkezunk') !== -1 ||
        normTitle.indexOf('bevettuk a varost') !== -1) {
      continue;
    }

    if (program.matchWord) {
      if (normTitle.indexOf(normProgName) !== 0) continue;
    } else if (normTitle.indexOf(normProgName) === -1 && normProgName.indexOf(normTitle) === -1) {
      var progWords = normProgName.split(' ').filter(function (w) { return w.length > 2; });
      var matchCount = progWords.filter(function (w) { return normTitle.indexOf(w) !== -1; }).length;
      if (matchCount < Math.min(2, progWords.length)) continue;
    }

    var parsed = parseSeasonEpisode(rawTitle);
    var sNum = parsed.season != null ? String(parsed.season) : '1';

    var epName = rawTitle;
    if (rawTitle.indexOf(',') !== -1) epName = rawTitle.split(',').slice(1).join(',').trim();
    else if (rawTitle.indexOf('–') !== -1) epName = rawTitle.split('–').slice(1).join('–').trim();
    else if (rawTitle.indexOf(' - ') !== -1) epName = rawTitle.split(' - ').slice(1).join(' - ').trim();
    else {
      var stripped = rawTitle.replace(new RegExp('^' + escapeRegExp(program.keyword || program.name), 'i'), '').trim();
      if (stripped.length >= 3) epName = stripped;
    }

    epName = epName
      .replace(/^(I{1,3}|IV|V|\d+)\.\s*(sorozat|évad|evad|rész|resz)\s*,?\s*/i, '')
      .replace(/^(I{1,3}|IV|V|\d+)\s*\/\s*\d+\.?\s*(rész|resz)?\s*/i, '')
      .replace(/^[,–\-:\s]+/, '')
      .trim();

    var dedupKey = sNum + ':' + normalizeTitle(epName || rawTitle);
    if (seenEpNames[dedupKey]) continue;
    seenEpNames[dedupKey] = true;

    if (!seasonsMap[sNum]) seasonsMap[sNum] = [];
    var alreadyEp = parsed.episode != null && seasonsMap[sNum].some(function (x) { return x.episode === parsed.episode; });
    var assignedEp = (parsed.episode != null && !alreadyEp) ? parsed.episode : (seasonsMap[sNum].length + 1);
    if (!epName || epName.length < 2) epName = assignedEp + '. rész';

    seasonsMap[sNum].push({
      season: parseInt(sNum, 10),
      episode: assignedEp,
      name: epName,
      rawTitle: rawTitle,
      token: decodeToken(token)
    });
  }

  var seasonKeys = Object.keys(seasonsMap);
  if (seasonKeys.length === 0) return null;

  for (var si = 0; si < seasonKeys.length; si++) {
    seasonsMap[seasonKeys[si]].sort(function (a, b) { return a.episode - b.episode; });
  }

  var result = { slug: cleanKey, name: program.name, seasons: seasonsMap };
  showEpisodesCache[cleanKey] = { ts: Date.now(), data: result };
  return result;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var budget = createBudget(45000);
    var rawStr = String(tmdbId || '').trim();
    if (!rawStr) return [];

    // 1. Direct MédiaKlikk video token
    if (rawStr.indexOf('mediaklikk:video:') === 0) {
      var token = rawStr.slice('mediaklikk:video:'.length).trim();
      var directM3u8 = await resolvePlayerM3u8(token);
      if (!directM3u8) return [];
      var st = buildNuvioStream({
        url: directM3u8,
        provider: 'MédiaKlikk',
        hoster: 'MTVA HLS',
        title: 'MédiaKlikk MTVA Archívum',
        quality: '1080p',
        height: 1080,
        language: 'Magyar',
        isHls: true,
        headers: HLS_HEADERS
      });
      return st ? [st] : [];
    }

    // 2. Direct MédiaKlikk program ID (mediaklikk:program:<slug> or :s:e)
    if (rawStr.indexOf('mediaklikk:program:') === 0) {
      var parts = rawStr.split(':');
      var sNum = season ? parseInt(season, 10) : 1;
      var eNum = episode ? parseInt(episode, 10) : 1;
      var slug = '';
      if (parts.length >= 5) {
        eNum = parseInt(parts[parts.length - 1], 10) || eNum;
        sNum = parseInt(parts[parts.length - 2], 10) || sNum;
        slug = sanitizeSlug(parts.slice(2, parts.length - 2).join(':'));
      } else {
        slug = sanitizeSlug(parts.slice(2).join(':'));
      }

      var progData = await getProgramEpisodes(slug);
      if (progData && progData.seasons) {
        var sList = progData.seasons[String(sNum)] || progData.seasons['1'] || [];
        var matchedEp = null;
        for (var i = 0; i < sList.length; i++) {
          if (sList[i].episode === eNum) {
            matchedEp = sList[i];
            break;
          }
        }
        if (!matchedEp) matchedEp = sList[eNum - 1] || sList[0];
        if (matchedEp && matchedEp.token) {
          var progM3u8 = await resolvePlayerM3u8(matchedEp.token);
          if (progM3u8) {
            var ps = buildNuvioStream({
              url: progM3u8,
              provider: 'MédiaKlikk',
              hoster: 'MTVA HLS',
              title: matchedEp.name || progData.name,
              quality: '1080p',
              height: 1080,
              language: 'Magyar',
              isHls: true,
              headers: HLS_HEADERS
            });
            return ps ? [ps] : [];
          }
        }
      }
      return [];
    }

    // 3. Direct Live Channel ID
    var lowerId = rawStr.toLowerCase();
    for (var ci = 0; ci < LIVE_CHANNELS.length; ci++) {
      var ch = LIVE_CHANNELS[ci];
      if (lowerId === ch.id || lowerId === ch.channelKey || lowerId === ch.streamId) {
        var liveM3u8 = await resolvePlayerM3u8(ch.streamId);
        if (!liveM3u8) return [];
        var ls = buildNuvioStream({
          url: liveM3u8,
          provider: 'MédiaKlikk',
          hoster: 'MTVA Élő',
          title: ch.name,
          quality: '1080p',
          height: 1080,
          language: 'Magyar',
          isHls: true,
          headers: HLS_HEADERS
        });
        return ls ? [ls] : [];
      }
    }

    // 4. Standard TMDB/IMDb VOD Resolution
    var meta = await resolveMediaMeta(tmdbId, mediaType, season, episode);
    if (!meta) return [];

    var hu = meta.hungarianTitle || meta.englishTitle;
    if (!hu) return [];

    var normTarget = normalizeTitle(hu);
    var isSeries = meta.type === 'series' || Boolean(meta.season && meta.episode);
    var reqSeason = meta.season ? parseInt(meta.season, 10) : null;
    var reqEp = meta.episode ? parseInt(meta.episode, 10) : null;
    var normEpTitle = meta.episodeTitle ? normalizeTitle(meta.episodeTitle) : '';

    // Fast-path for verified Hungarian series (excluding Magyar népmesék which is best handled by Videa/Videakid + general query)
    if (isSeries) {
      var matchedClassic = null;
      for (var vi = 0; vi < VERIFIED_MEDIAKLIKK_CLASSICS.length; vi++) {
        var cl = VERIFIED_MEDIAKLIKK_CLASSICS[vi];
        if (cl.slug === 'magyar-nepmesek') continue;
        if ((meta.imdbId && cl.imdbId === meta.imdbId) ||
            normalizeTitle(cl.name) === normTarget ||
            normTarget.indexOf(cl.matchWord) !== -1 ||
            cl.matchWord.indexOf(normTarget) !== -1) {
          matchedClassic = cl;
          break;
        }
      }

      if (matchedClassic && !budget.expired(4000)) {
        var classicData = await getProgramEpisodes(matchedClassic.slug);
        if (classicData && classicData.seasons) {
          var csList = classicData.seasons[String(reqSeason || 1)] || classicData.seasons['1'] || [];
          var cmEp = null;
          for (var ei = 0; ei < csList.length; ei++) {
            if (csList[ei].episode === (reqEp || 1)) {
              cmEp = csList[ei];
              break;
            }
          }
          if (!cmEp && normEpTitle) {
            for (var ej = 0; ej < csList.length; ej++) {
              if (normalizeTitle(csList[ej].name).indexOf(normEpTitle) !== -1) {
                cmEp = csList[ej];
                break;
              }
            }
          }
          if (cmEp && cmEp.token) {
            var classicM3u8 = await resolvePlayerM3u8(cmEp.token);
            if (classicM3u8) {
              var cst = buildNuvioStream({
                url: classicM3u8,
                provider: 'MédiaKlikk',
                hoster: 'MTVA HLS',
                title: matchedClassic.name + ' - ' + cmEp.name,
                quality: '1080p',
                height: 1080,
                language: 'Magyar',
                isHls: true,
                headers: HLS_HEADERS
              });
              if (cst) return [cst];
            }
          }
        }
      }
    }

    // Targeted keywords search
    var queries = [];
    var addQ = function (q) {
      if (q && queries.indexOf(q) === -1) queries.push(q);
    };
    if (normTarget.indexOf('ho ho') !== -1 || normTarget.indexOf('hoho') !== -1 || normTarget.indexOf('horgasz') !== -1) {
      addQ('ho-ho-ho');
      addQ('A nagy ho-ho-ho-horgász');
    } else if (normTarget.indexOf('nepmese') !== -1) {
      addQ('Magyar népmesék');
      addQ('népmesék');
    } else if (normTarget.indexOf('tenkes') !== -1) {
      addQ('Tenkes');
    } else if (normTarget.indexOf('mezga') !== -1) {
      addQ('Mézga');
    } else if (normTarget.indexOf('frakk') !== -1) {
      addQ('Frakk');
    } else if (normTarget.indexOf('pom pom') !== -1 || normTarget.indexOf('pompom') !== -1) {
      addQ('Pom-Pom');
    } else if (normTarget.indexOf('kukori') !== -1) {
      addQ('Kukori');
    } else if (normTarget.indexOf('susu') !== -1) {
      addQ('Süsü');
    } else if (normTarget.indexOf('bakterhaz') !== -1) {
      addQ('bakterház');
      addQ('Indul a bakterház');
    } else if (normTarget.indexOf('vuk') !== -1) {
      addQ('Vuk');
    } else {
      addQ(hu);
      if (meta.episodeTitle) addQ(meta.episodeTitle);
    }

    var streams = [];
    for (var qi = 0; qi < queries.length; qi++) {
      if (budget.expired(3000)) break;
      var items = await searchMediaKlikkItems(queries[qi], 40);
      if (items.length === 0) continue;

      var matchedTokens = [];
      for (var ii = 0; ii < items.length; ii++) {
        var it = items[ii];
        var rawTitle = decodeHtmlEntities(String(it.post_title || (it.source && it.source.post_title) || '').replace(/<[^>]+>/g, '').trim());
        var normItemTitle = normalizeTitle(rawTitle);
        var tok = it.token || (it.source && it.source.token);
        if (!tok) continue;

        var isMatch = false;
        if (isSeries) {
          var targetWords = normTarget.split(/\s+/);
          var titleMatches = normItemTitle.indexOf(normTarget) !== -1 ||
            normTarget.indexOf(normItemTitle) !== -1 ||
            targetWords.some(function (w) { return w.length > 3 && normItemTitle.indexOf(w) !== -1; });
          if (!titleMatches) continue;

          var parsed = parseSeasonEpisode(rawTitle);
          if (reqSeason !== null && reqEp !== null && parsed.season !== null && parsed.episode !== null) {
            if (parsed.season === reqSeason && parsed.episode === reqEp) isMatch = true;
          } else if (reqEp !== null && parsed.episode !== null && parsed.episode === reqEp) {
            if (reqSeason === null || parsed.season === null || parsed.season === reqSeason) isMatch = true;
          }

          if (!isMatch && normEpTitle && normEpTitle.length > 2) {
            if (normItemTitle.indexOf(normEpTitle) !== -1 || normEpTitle.indexOf(normItemTitle) !== -1) {
              isMatch = true;
            }
          }
        } else {
          if (normItemTitle.indexOf(normTarget) !== -1 || normTarget.indexOf(normItemTitle) !== -1) {
            isMatch = true;
          }
        }

        if (isMatch) {
          matchedTokens.push({ token: tok, rawTitle: rawTitle });
        }
      }

      if (matchedTokens.length > 0) {
        var resolvedUrls = await Promise.all(
          matchedTokens.slice(0, 4).map(async function (mt) {
            var m3u8 = await resolvePlayerM3u8(mt.token);
            return m3u8 ? { m3u8: m3u8, rawTitle: mt.rawTitle } : null;
          })
        );

        for (var ri = 0; ri < resolvedUrls.length; ri++) {
          var entry = resolvedUrls[ri];
          if (!entry) continue;
          var s = buildNuvioStream({
            url: entry.m3u8,
            provider: 'MédiaKlikk',
            hoster: 'MTVA HLS',
            title: entry.rawTitle,
            quality: '1080p',
            height: 1080,
            language: 'Magyar',
            isHls: true,
            headers: HLS_HEADERS
          });
          if (s) streams.push(s);
        }

        if (streams.length > 0) break;
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
