'use strict';

var { fetchJson, getSetting } = require('./http');
var nepmesekEpisodes = require('../_data/magyar_nepmesek_episodes.json');

var DEFAULT_TMDB_API_KEY = 'ffe7ef8916c61835264d2df68276ddc2';
var META_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
var MAX_META_CACHE = 200;
var metaCache = {};

var TENKES_KAPITANYA_EPISODES = {
  1: 'A vérdíj',
  2: 'Az embervadászat',
  3: 'Buga Jakab',
  4: 'A tőzsér',
  5: 'A fejvadász',
  6: 'A katona szerencséje',
  7: 'Kettős kém',
  8: 'A kémszemle',
  9: 'A meglepetés',
  10: 'A vörös ördögök',
  11: 'A hadicsel',
  12: 'A fogoly',
  13: 'A vár ostroma'
};

var HOHO_HORGASZ_EPISODES = {
  1: {
    1: 'Reszkessetek halacskák',
    2: 'A csalafinta csali',
    3: 'A repülő hal',
    4: 'A sötétlelkű orvhorgász',
    5: 'Születésnapi ajándék',
    6: 'A gumihal',
    7: 'A falánk pelikán',
    8: 'Az éjszakai horgászat',
    9: 'Teknősháton lovagolva',
    10: 'A mindentvágó rákolló',
    11: 'A titokzatos békaember',
    12: 'Nászajándék',
    13: 'Virágcsokor a horgon'
  },
  2: {
    1: 'Horgász a tetőn',
    2: 'Horgász a kéményben',
    3: 'Szálka hal nélkül',
    4: 'A megszökött műhal',
    5: 'Csecsemőaltató horgászbot',
    6: 'Horgász a halpiacon',
    7: 'Mit hozott a Mikulás',
    8: 'A karácsonyi hal',
    9: 'A holló és a hal',
    10: 'Hová tűnt a horgászzsinór',
    11: 'Kétoldali horgászláz',
    12: 'A fagyasztott hal',
    13: 'Az eldugult mosogató'
  }
};

var PRELOADED_HUNGARIAN_TITLES = {
  tt0129719: { hu: 'Süsü, a sárkány kalandjai', en: 'Süsü, the Dragon', year: '1977', runtime: 30 },
  tt0056789: { hu: 'A Tenkes kapitánya', en: 'Captain Tenkes', year: '1964', runtime: 25 },
  tt0861751: { hu: 'Magyar népmesék', en: 'Hungarian Folk Tales', year: '1980', runtime: 10 },
  tt0136650: { hu: 'Üzenet a jövőből - A Mézga család', en: 'The Mézga Family', year: '1969', runtime: 25 },
  tt1225872: { hu: 'Vakáción a Mézga család', en: 'The Mézga Family on Holiday', year: '1978', runtime: 25 },
  tt0167595: { hu: 'Frakk, a macskák réme', en: "Frakk, the Cats' Nightmare", year: '1971', runtime: 10 },
  tt0168342: { hu: 'Kukori és Kotkoda', en: 'Kukori and Kotkoda', year: '1971', runtime: 10 },
  tt0154077: { hu: 'A nagy ho-ho-horgász', en: 'The Great Ho-ho-ho-angler', year: '1982', runtime: 10 },
  tt0166931: { hu: 'Pom-Pom meséi', en: 'Tales of Pom Pom', year: '1980', runtime: 10 },
  tt0168343: { hu: 'Kérem a következőt! (Dr. Bubó)', en: 'Next, Please!', year: '1974', runtime: 10 },
  tt0179955: { hu: 'Macskafogó', en: 'Cat City', year: '1986', runtime: 96 },
  tt0257290: { hu: 'Üvegtigris', en: 'Glass Tiger', year: '2001', runtime: 104 },
  tt0065067: { hu: 'A tanú', en: 'The Witness', year: '1969', runtime: 103 },
  tt0121403: { hu: 'Indul a bakterház', en: 'The Station Master', year: '1980', runtime: 66 },
  tt0303184: { hu: 'Valami Amerika', en: 'A Kind of America', year: '2002', runtime: 115 },
  tt0069697: { hu: 'Különben dühbe jövünk', en: "Watch Out, We're Mad", year: '1974', runtime: 102 },
  tt0085327: { hu: 'Kincs, ami nincs', en: 'Who Finds a Friend Finds a Treasure', year: '1981', runtime: 102 },
  tt0131636: { hu: 'Vuk', en: 'The Little Fox', year: '1981', runtime: 76 },
  tt8111088: { hu: 'A Mandalóri', en: 'The Mandalorian', year: '2019', runtime: 40 },
  tt0268380: { hu: 'Jégkorszak', en: 'Ice Age', year: '2002', runtime: 81 },
  tt0060196: { hu: 'A Jó, a Rossz és a Csúf', en: 'The Good, the Bad and the Ugly', year: '1966', runtime: 161 },
  tt0848228: { hu: 'Bosszúállók', en: 'The Avengers', year: '2012', runtime: 143 }
};

function normalizeTitle(str) {
  var s = String(str || '').toLowerCase();
  if (typeof s.normalize === 'function') {
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return s
    .replace(/[áàâäã]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôöőõ]/g, 'o')
    .replace(/[úùûüűũ]/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeMediaType(mediaType) {
  var t = String(mediaType || '').toLowerCase();
  if (t === 'tv' || t === 'series' || t === 'show') return 'series';
  return 'movie';
}

function getClassicEpisodeTitle(imdbId, hungarianTitle, season, episode) {
  if (!season || !episode) return '';
  var s = parseInt(season, 10);
  var e = parseInt(episode, 10);
  var normHu = normalizeTitle(hungarianTitle || '');

  if (imdbId === 'tt0056789' || normHu.indexOf('tenkes') !== -1) {
    return TENKES_KAPITANYA_EPISODES[e] || '';
  }
  if (imdbId === 'tt0154077' || normHu.indexOf('horgasz') !== -1) {
    return (HOHO_HORGASZ_EPISODES[s] && HOHO_HORGASZ_EPISODES[s][e]) || '';
  }
  if (imdbId === 'tt0861751' || normHu.indexOf('nepmese') !== -1) {
    var list = nepmesekEpisodes[String(s)];
    if (Array.isArray(list)) {
      var found = list.find(function (item) {
        return item && item.ep === e;
      }) || list[e - 1];
      if (found && found.title) return found.title;
    }
  }
  return '';
}

async function resolveHungarianTitleViaWiki(englishTitle, imdbId) {
  if (!englishTitle) return null;
  try {
    if (imdbId && /^tt\d+$/.test(imdbId)) {
      var sparql = 'SELECT ?huLabel WHERE { ?item wdt:P345 "' + imdbId + '". ?item rdfs:label ?huLabel. FILTER(LANG(?huLabel)="hu") } LIMIT 1';
      var wd = await fetchJson(
        'https://query.wikidata.org/sparql?query=' + encodeURIComponent(sparql) + '&format=json',
        { headers: { Accept: 'application/json' } },
        2500
      );
      var huVal = wd && wd.results && wd.results.bindings && wd.results.bindings[0] && wd.results.bindings[0].huLabel && wd.results.bindings[0].huLabel.value;
      if (huVal) return huVal.trim();
    }
  } catch (_) {}
  return null;
}

function cleanWikiOrTmdbTitle(title) {
  return String(title || '').replace(/\s*\([^)]*\)\s*$/g, '').trim();
}

async function resolveMediaMeta(rawId, mediaType, season, episode) {
  var idStr = String(rawId || '').trim();
  if (!idStr) return null;

  var type = normalizeMediaType(mediaType);
  var isSeries = type === 'series' || (season != null && episode != null);
  var sNum = isSeries && season != null && season !== '' ? parseInt(season, 10) : undefined;
  var eNum = isSeries && episode != null && episode !== '' ? parseInt(episode, 10) : undefined;
  if (isNaN(sNum)) sNum = undefined;
  if (isNaN(eNum)) eNum = undefined;

  var cacheKey = [idStr, type, sNum || '', eNum || ''].join(':');
  var cached = metaCache[cacheKey];
  if (cached && (Date.now() - cached.ts) < META_CACHE_TTL_MS) {
    return cached.data;
  }

  var apiKey = getSetting('tmdbApiKey', DEFAULT_TMDB_API_KEY);
  var tmdbId = '';
  var imdbId = '';
  var hungarianTitle = '';
  var englishTitle = '';
  var year = '';
  var runtimeMinutes = null;
  var episodeTitle = '';

  // Custom ID passthrough support (e.g. netmozi:series:42579:1:1 or mediaklikk:program:...)
  if (idStr.indexOf('netmozi:') === 0 || idStr.indexOf('mediaklikk:') === 0) {
    var directMeta = {
      id: idStr,
      tmdbId: '',
      imdbId: idStr,
      type: type,
      hungarianTitle: '',
      englishTitle: '',
      year: '',
      runtimeMinutes: null,
      season: sNum,
      episode: eNum,
      episodeTitle: ''
    };
    return directMeta;
  }

  if (/^tt\d+$/i.test(idStr)) {
    imdbId = idStr.toLowerCase();
  } else {
    tmdbId = idStr.replace(/^tmdb:/i, '').trim();
  }

  // 1. Preloaded Hungarian classics table (instant, zero network)
  if (imdbId && PRELOADED_HUNGARIAN_TITLES[imdbId]) {
    var pre = PRELOADED_HUNGARIAN_TITLES[imdbId];
    hungarianTitle = pre.hu;
    englishTitle = pre.en || pre.hu;
    year = pre.year || '';
    runtimeMinutes = pre.runtime || null;
  }

  // 2. Numeric TMDB ID -> TMDB hu-HU + external_ids + year + runtime (+ en fallback)
  if (tmdbId && /^\d+$/.test(tmdbId)) {
    var endpoint = isSeries ? 'tv/' + tmdbId : 'movie/' + tmdbId;
    var tmdbData = await fetchJson(
      'https://api.themoviedb.org/3/' + endpoint + '?api_key=' + encodeURIComponent(apiKey) + '&language=hu-HU&append_to_response=external_ids',
      null,
      3500
    );
    if (tmdbData) {
      if (!imdbId && tmdbData.external_ids && tmdbData.external_ids.imdb_id) {
        imdbId = tmdbData.external_ids.imdb_id;
      } else if (!imdbId && tmdbData.imdb_id) {
        imdbId = tmdbData.imdb_id;
      }
      if (imdbId && PRELOADED_HUNGARIAN_TITLES[imdbId]) {
        var preTmdb = PRELOADED_HUNGARIAN_TITLES[imdbId];
        hungarianTitle = hungarianTitle || preTmdb.hu;
        englishTitle = englishTitle || preTmdb.en;
        year = year || preTmdb.year;
        runtimeMinutes = runtimeMinutes || preTmdb.runtime;
      }
      hungarianTitle = hungarianTitle || tmdbData.title || tmdbData.name || '';
      englishTitle = englishTitle || tmdbData.original_title || tmdbData.original_name || '';
      if (!year) {
        var rel = tmdbData.release_date || tmdbData.first_air_date || '';
        var ym = String(rel).match(/^(\d{4})/);
        if (ym) year = ym[1];
      }
      if (!runtimeMinutes) {
        if (tmdbData.runtime) runtimeMinutes = parseInt(tmdbData.runtime, 10);
        else if (Array.isArray(tmdbData.episode_run_time) && tmdbData.episode_run_time[0]) {
          runtimeMinutes = parseInt(tmdbData.episode_run_time[0], 10);
        }
      }
      if (isSeries && sNum && eNum) {
        episodeTitle = getClassicEpisodeTitle(imdbId, hungarianTitle, sNum, eNum);
        if (!episodeTitle) {
          var epData = await fetchJson(
            'https://api.themoviedb.org/3/tv/' + tmdbId + '/season/' + sNum + '/episode/' + eNum + '?api_key=' + encodeURIComponent(apiKey) + '&language=hu-HU',
            null,
            2500
          );
          if (epData && epData.name && !/^epiz[oó]d\s*\d+$/i.test(epData.name) && !/^episode\s*\d+$/i.test(epData.name)) {
            episodeTitle = epData.name;
          }
          if (!runtimeMinutes && epData && epData.runtime) {
            runtimeMinutes = parseInt(epData.runtime, 10);
          }
        }
      }
      // If original_language isn't English and original_title matches hungarianTitle or is non-Latin (e.g. Japanese/Korean/French), fetch English TMDB title too
      if (tmdbData.original_language && tmdbData.original_language !== 'en' && tmdbData.original_language !== 'hu') {
        var enTmdb = await fetchJson(
          'https://api.themoviedb.org/3/' + endpoint + '?api_key=' + encodeURIComponent(apiKey) + '&language=en-US',
          null,
          2500
        );
        if (enTmdb && (enTmdb.title || enTmdb.name)) {
          englishTitle = enTmdb.title || enTmdb.name;
        }
      }
    }
  }

  // 3. IMDb ID lookup (when Nuvio has no TMDB key configured, or TMDB lookup above returned nothing)
  if ((!hungarianTitle || !englishTitle) && imdbId && /^tt\d+$/.test(imdbId)) {
    var findData = await fetchJson(
      'https://api.themoviedb.org/3/find/' + encodeURIComponent(imdbId) + '?api_key=' + encodeURIComponent(apiKey) + '&external_source=imdb_id&language=hu-HU',
      null,
      3000
    );
    var findHit = findData && ((isSeries ? findData.tv_results : findData.movie_results) || findData.movie_results || findData.tv_results || [])[0];
    if (findHit) {
      tmdbId = tmdbId || String(findHit.id || '');
      hungarianTitle = hungarianTitle || findHit.title || findHit.name || '';
      englishTitle = englishTitle || findHit.original_title || findHit.original_name || '';
      if (!year) {
        var fRel = findHit.release_date || findHit.first_air_date || '';
        var fYm = String(fRel).match(/^(\d{4})/);
        if (fYm) year = fYm[1];
      }
    }

    // Cinemeta fallback (no API key required)
    if (!hungarianTitle || !englishTitle || !year || !runtimeMinutes || (isSeries && !episodeTitle)) {
      var cmType = isSeries ? 'series' : 'movie';
      var cmData = await fetchJson('https://v3-cinemeta.strem.io/meta/' + cmType + '/' + imdbId + '.json', null, 3500);
      var cmMeta = cmData && cmData.meta;
      if (cmMeta) {
        englishTitle = englishTitle || cmMeta.name || '';
        if (!year) {
          var cmY = String(cmMeta.year || cmMeta.releaseInfo || '').match(/(\d{4})/);
          if (cmY) year = cmY[1];
        }
        if (!runtimeMinutes && cmMeta.runtime) {
          var rtMatch = String(cmMeta.runtime).match(/(\d+)/);
          if (rtMatch) runtimeMinutes = parseInt(rtMatch[1], 10);
        }
        if (isSeries && sNum && eNum && !episodeTitle && Array.isArray(cmMeta.videos)) {
          var epObj = cmMeta.videos.find(function (v) {
            return Number(v.season) === sNum && Number(v.episode) === eNum;
          });
          if (epObj && (epObj.title || epObj.name)) {
            episodeTitle = epObj.title || epObj.name;
          }
        }
      }
    }
  }

  // 4. Wikidata Hungarian title fallback if we still only have an English title
  if (!hungarianTitle && englishTitle) {
    var wdHu = await resolveHungarianTitleViaWiki(englishTitle, imdbId);
    if (wdHu) hungarianTitle = wdHu;
  }

  if (!hungarianTitle && englishTitle) hungarianTitle = englishTitle;
  if (!englishTitle && hungarianTitle) englishTitle = hungarianTitle;

  hungarianTitle = cleanWikiOrTmdbTitle(hungarianTitle);
  englishTitle = cleanWikiOrTmdbTitle(englishTitle);

  if (isSeries && sNum && eNum && !episodeTitle) {
    episodeTitle = getClassicEpisodeTitle(imdbId, hungarianTitle, sNum, eNum);
  }

  var result = {
    id: imdbId || tmdbId || idStr,
    tmdbId: tmdbId,
    imdbId: imdbId,
    type: isSeries ? 'series' : 'movie',
    hungarianTitle: hungarianTitle,
    englishTitle: englishTitle,
    year: year,
    runtimeMinutes: Number.isFinite(runtimeMinutes) && runtimeMinutes > 0 ? runtimeMinutes : null,
    season: sNum,
    episode: eNum,
    episodeTitle: episodeTitle
  };

  if (hungarianTitle || englishTitle) {
    var keys = Object.keys(metaCache);
    if (keys.length >= MAX_META_CACHE) {
      delete metaCache[keys[0]];
    }
    metaCache[cacheKey] = { ts: Date.now(), data: result };
  }

  return result;
}

function generateSearchQueries(meta) {
  var queries = [];
  var add = function (q) {
    if (q && queries.indexOf(q) === -1) queries.push(q);
  };
  var hu = meta.hungarianTitle;
  var en = meta.englishTitle;
  var year = meta.year;
  var s = meta.season;
  var e = meta.episode;

  if (s && e) {
    var sPad = s < 10 ? '0' + s : String(s);
    var ePad = e < 10 ? '0' + e : String(e);

    if (hu) {
      if (meta.episodeTitle) {
        add(hu + ' ' + meta.episodeTitle);
        add(meta.episodeTitle);
        add(hu + ' - ' + meta.episodeTitle);
      }
      add(hu + ' S' + sPad + 'E' + ePad);
      add(hu + ' ' + s + 'x' + e);
      add(hu + ' ' + s + 'x' + ePad);
      add(hu + ' ' + s + '. evad ' + e + '. resz');
      add(hu + ' ' + e + '. resz');
      add(hu);
    }
    if (en && en !== hu) {
      add(en + ' S' + sPad + 'E' + ePad);
      add(en + ' ' + s + 'x' + e);
      add(en);
    }
  } else {
    if (hu) {
      add(hu + ' teljes film');
      if (year) add(hu + ' ' + year);
      add(hu + ' teljes film magyarul');
      add(hu);
    }
    if (en && en !== hu) {
      add(en + ' teljes film');
      if (year) add(en + ' ' + year);
      add(en);
    }
  }
  return queries;
}

// ---------------------------------------------------------------------------
// Matching & Validation Helpers (shared cleanly across all 13 providers)
// ---------------------------------------------------------------------------

var JUNK_TITLE_REGEX = /\b(filmzene|zene|soundtrack|ost|par[oó]dia|f[oő]c[ií]mdal|focimdal|trailer|el[oő]zetes|elozetes|p[aá]rbaj|parbaj|interj[uú]|interju|d[aá]n [aá]llami|nagyd[ií]j|nagydij|id[oő]m[eé]r[oő]|idomero|szabadedz[eé]s|szabadedzes|futam|sprintkvalifik[aá]ci[oó]|boxutca|forma-?1|formula-?1|gameplay|v[eé]gigj[aá]tsz[aá]s|vegigjatszas|[oö]sszefoglal[oó]|osszefoglalo)\b/i;

function extractUploadYearFromText(text) {
  if (!text || typeof text !== 'string') return null;
  var patterns = [
    /<(?:upload_date|created_at|date|pubDate)>[^<]*?\b(20\d{2})\b/i,
    /["'](?:uploadDate|datePublished|upload_date|created_at)["']\s*:\s*["'](20\d{2})/i,
    /\b(20\d{2})[.\-/](?:0[1-9]|1[0-2])[.\-/](?:0[1-9]|[12]\d|3[01])\b/
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = text.match(patterns[i]);
    if (m && m[1]) {
      var y = parseInt(m[1], 10);
      if (y >= 2005 && y <= 2030) return y;
    }
  }
  return null;
}

function extractCandidateYears(candidateTitle, targetTitle) {
  if (!candidateTitle) return [];
  var titleYears = {};
  var reTarget = /\b(19\d\d|20\d\d)\b/g;
  var tm;
  while ((tm = reTarget.exec(String(targetTitle || ''))) !== null) {
    titleYears[parseInt(tm[1], 10)] = true;
  }

  var found = [];
  var reCand = /\b(19\d\d|20\d\d)\b/g;
  var cm;
  while ((cm = reCand.exec(String(candidateTitle))) !== null) {
    var y = parseInt(cm[1], 10);
    if (!titleYears[y]) found.push(y);
  }
  return found;
}

function hasVerifiedYearInTitle(candidateTitle, targetYear, targetTitle) {
  if (!targetYear || !candidateTitle) return false;
  var tYear = parseInt(targetYear, 10);
  if (isNaN(tYear)) return false;
  var years = extractCandidateYears(candidateTitle, targetTitle || '');
  return years.some(function (y) {
    return Math.abs(y - tYear) <= 1;
  });
}

function isValidRuntime(durationSeconds, meta) {
  if (!durationSeconds || durationSeconds <= 0) return true;
  var isMovie = !meta || meta.type === 'movie' || !meta.season;

  if (meta && meta.runtimeMinutes && meta.runtimeMinutes > 0) {
    var targetSec = meta.runtimeMinutes * 60;
    if (isMovie) {
      var palAdjustedSec = Math.round(targetSec * 0.96);
      var minSec = Math.max(1800, palAdjustedSec - 600);
      var maxSec = targetSec + 600;
      return durationSeconds >= minSec && durationSeconds <= maxSec;
    } else {
      var minEp = Math.max(300, Math.round(targetSec * 0.60) - 300);
      var maxEp = Math.round(targetSec * 1.45) + 600;
      return durationSeconds >= minEp && durationSeconds <= maxEp;
    }
  }

  return isMovie
    ? (durationSeconds >= 2400 && durationSeconds <= 18000)
    : (durationSeconds >= 300 && durationSeconds <= 7200);
}

function checkPageMetadata(pageHtml, meta) {
  if (!pageHtml || !meta) return { match: true, verified: false };
  var isMovie = meta.type === 'movie' || !meta.season;

  if (meta.imdbId && /^tt\d+$/i.test(meta.imdbId)) {
    var imdbMatches = [];
    var r1 = /imdb\.com\/title\/(tt\d+)/gi;
    var r2 = /\[imdb:(tt\d+)\]/gi;
    var m;
    while ((m = r1.exec(pageHtml)) !== null) imdbMatches.push(m[1].toLowerCase());
    while ((m = r2.exec(pageHtml)) !== null) imdbMatches.push(m[1].toLowerCase());

    if (imdbMatches.length > 0) {
      if (imdbMatches.indexOf(meta.imdbId.toLowerCase()) !== -1) {
        return { match: true, verified: true, reason: 'imdb' };
      }
      return { match: false, verified: true, reason: 'imdb_mismatch' };
    }
  }

  if (isMovie && meta.year) {
    var tYear = parseInt(meta.year, 10);
    if (!isNaN(tYear)) {
      var yearPatterns = [
        /<span[^>]*class=["'][^"']*\byear\b[^"']*["'][^>]*>\s*(19\d\d|20\d\d)\s*<\/span>/i,
        /<span[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>[^<]*?\b(19\d\d|20\d\d)\b\s*<\/span>/i,
        /(?:Év|Évjárat|Megjelenés(?:\s+éve)?|Kiadás(?:\s+éve)?)\s*:\s*(?:<[^>]+>\s*)*(19\d\d|20\d\d)\b/i,
        /<h1[^>]*>[^<]*?\((19\d\d|20\d\d)\)/i,
        /<title>[^<]*?\((19\d\d|20\d\d)\)/i
      ];
      for (var i = 0; i < yearPatterns.length; i++) {
        var ym = pageHtml.match(yearPatterns[i]);
        if (ym && ym[1]) {
          var pYear = parseInt(ym[1], 10);
          if (Math.abs(pYear - tYear) <= 1) {
            return { match: true, verified: true, reason: 'year' };
          }
          return { match: false, verified: true, reason: 'year_mismatch' };
        }
      }
    }
  }

  return { match: true, verified: false };
}

function isTitleMatch(targetTitle, candidateTitle, targetYear, isSeries) {
  if (!targetTitle || !candidateTitle) return false;
  if (JUNK_TITLE_REGEX.test(candidateTitle)) return false;

  var cleanTarget = String(targetTitle).replace(/\s*[-–:]\s*(a film|the movie|film|sorozat)\s*$/i, '').trim() || targetTitle;
  var normTarget = normalizeTitle(cleanTarget);
  var normCand = normalizeTitle(candidateTitle);
  if (!normTarget || !normCand) return false;

  if (!isSeries) {
    var targetHasNumber = /\b([2-9]|ii|iii|iv|v|vi)\b/i.test(normTarget);
    var candHasNumber = /\b([2-9]|ii|iii|iv|v|vi)\b/i.test(normCand);
    if (!targetHasNumber && candHasNumber) return false;

    var sequelSubRe = /\b(ujratoltve|forradalmak|feltamadasok|reloaded|revolutions|resurrections)\b/i;
    if (!sequelSubRe.test(normTarget) && sequelSubRe.test(normCand)) return false;

    if (targetYear) {
      var tYear = parseInt(targetYear, 10);
      if (!isNaN(tYear)) {
        var candYears = extractCandidateYears(normCand, normTarget);
        if (candYears.length > 0 && !candYears.some(function (cy) { return Math.abs(cy - tYear) <= 1; })) {
          return false;
        }
      }
    }

    if (normTarget.length <= 3) {
      var hasWord = new RegExp('\\b' + escapeRegExp(normTarget) + '\\b', 'i').test(normCand);
      if (!hasWord) return false;
      var hasMovieCue = /\b(film|teljes|mozi|szinkron|szinkronos|magyarul|felirat|feliratos|hd|1080p|720p|brad pitt)\b/i.test(normCand);
      var hasExactYear = targetYear && normCand.indexOf(String(targetYear)) !== -1;
      return Boolean(hasMovieCue || hasExactYear || normCand === normTarget);
    }
  }

  var stopWords = ['egy', 'nem', 'mint', 'hogy', 'the', 'and', 'film', 'teljes', 'magyarul', 'online', 'szinkronos'];
  var targetWords = normTarget.split(' ').filter(function (w) {
    return w.length >= 2 && stopWords.indexOf(w) === -1;
  });

  if (targetWords.length === 0) {
    var rawWords = normTarget.split(' ').filter(function (w) { return w.length >= 2; });
    if (rawWords.length === 0) {
      return new RegExp('\\b' + escapeRegExp(normTarget) + '\\b', 'i').test(normCand);
    }
    return rawWords.every(function (w) {
      return new RegExp('\\b' + escapeRegExp(w) + '\\b', 'i').test(normCand);
    });
  }

  if (targetWords.length === 1 && targetWords[0].length <= 3) {
    return new RegExp('\\b' + escapeRegExp(targetWords[0]) + '\\b', 'i').test(normCand);
  }

  var matched = targetWords.filter(function (w) {
    if (w.length <= 3) return new RegExp('(?:^|\\s)' + escapeRegExp(w) + '(?:\\s|$)', 'i').test(normCand);
    return new RegExp('(?:^|\\s)' + escapeRegExp(w), 'i').test(normCand);
  });

  if (targetWords.length <= 2) {
    return matched.length === targetWords.length;
  }
  return (matched.length / targetWords.length) >= 0.6;
}

function matchesEpisode(title, season, episode, epTitle) {
  if (!season && !episode) return true;
  var t = String(title || '').toLowerCase();
  var sNum = season ? parseInt(season, 10) : null;
  var eNum = episode ? parseInt(episode, 10) : null;

  var evadMatch = t.match(/(\d+)\s*\.?\s*[eé]vad/i) || t.match(/season\s*(\d+)/i);
  if (evadMatch && sNum) {
    var s = parseInt(evadMatch[1], 10);
    if (!isNaN(s) && s !== sNum) return false;
  }

  var seMatch = t.match(/s(\d+)\s*e(\d+)/i) || t.match(/(\d+)x(\d+)/i);
  if (seMatch) {
    var seS = parseInt(seMatch[1], 10);
    var seE = parseInt(seMatch[2], 10);
    return seE === eNum && (!sNum || seS === sNum || isNaN(seS));
  }

  if (sNum && sNum > 1 && !evadMatch) {
    if (epTitle && epTitle.length >= 4 && t.indexOf(epTitle.toLowerCase()) !== -1) {
      return true;
    }
    return false;
  }

  if (epTitle && epTitle.length >= 4 && t.indexOf(epTitle.toLowerCase()) !== -1) {
    return true;
  }

  var reszMatch = t.match(/(\d+)\s*\.?\s*r[eé]sz/i);
  if (reszMatch) {
    return parseInt(reszMatch[1], 10) === eNum;
  }

  var epMatch = t.match(/(\d+)\s*\.?\s*epiz[oó]d/i);
  if (epMatch) {
    return parseInt(epMatch[1], 10) === eNum;
  }

  return true;
}

module.exports = {
  JUNK_TITLE_REGEX,
  TENKES_KAPITANYA_EPISODES,
  HOHO_HORGASZ_EPISODES,
  PRELOADED_HUNGARIAN_TITLES,
  normalizeTitle,
  escapeRegExp,
  normalizeMediaType,
  resolveMediaMeta,
  generateSearchQueries,
  extractUploadYearFromText,
  extractCandidateYears,
  hasVerifiedYearInTitle,
  isValidRuntime,
  checkPageMetadata,
  isTitleMatch,
  matchesEpisode
};
