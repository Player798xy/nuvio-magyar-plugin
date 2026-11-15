# Nuvio Magyar Pluginok (`nuvio-magyar-plugin`)

Közvetlen, **proxy nélküli** Nuvio JS Plugin csomag magyar szinkronos és feliratos filmekhez, sorozatokhoz, rajzfilmekhez és élő MTVA/MédiaKlikk adásokhoz. Minden scraper és hoster dekódoló közvetlenül a felhasználó eszközén (QuickJS / React Native Hermes runtime alatt, külső HTTP szerver nélkül) fut le.

## Telepítés a Nuvio alkalmazásban

1. Nyisd meg a **Nuvio** alkalmazásban a **Plugins / Bővítmények** menüt.
2. Add hozzá a tároló nyers `manifest.json` URL-jét:

```text
https://raw.githubusercontent.com/Player798xy/nuvio-magyar-plugin/main/manifest.json
```

3. A Nuvio betölti a 13 különálló magyar forrást a `providers/*.js` csomagokból. Ha a Nuvio beállításaiban bekapcsolod a **Group plugins by repo** opciót, az összes magyar forrás egyetlen repó-csoport alatt, az angol pluginoktól elkülönítve jelenik meg, miközben egyesével is ki-/bekapcsolhatók.

## Automatikus minőségszűrés és rendezés

Minden provider kimenete a közös `finalizeStreams` tisztítón megy át (`src/_shared/hosters.js`):

- **Feltöltésenként csak a legjobb minőség marad:** egy Videa/Indavideo/VOE/OK.ru/RPM/Byse videó már nem szór be 4–5 külön felbontást (`1080p`, `720p`, `480p`, `360p`, `240p`) — feltöltésenként csak a legmagasabb minőségű stream kerül be.
- **HD esetén eltűnik az SD szemét:** ha létezik legalább egy `720p` vagy `1080p` találat, a `480p`, `360p` és `240p` linkek automatikusan kiszűrésre kerülnek.
- **Szigorú rendezés:** `Magyar Szinkron` elöl, csökkenő felbontás szerint (`2160p → 1440p → 1080p → 720p → 480p`), azonos felbontásnál `HLS` előrébb az `MP4`-nél.

## Támogatott források (`manifest.json`)

| ID | Név | Típusok | Formátum | Megjegyzés |
| --- | --- | --- | --- | --- |
| `netmozi` | NetMozi | `movie`, `tv` | `m3u8`, `mp4` | Mindjárt / NetMozi link payload dekódolás + közvetlen hoster feloldás |
| `jobbmintatv` | JobbMintATV | `movie`, `tv` | `mp4`, `m3u8` | `windows-1250` slug-biztos keresés, Videa/Indavideo/OK.ru/hosterek |
| `filmezek` | Filmezek | `movie`, `tv` | `mp4`, `m3u8` | Videa (`v=` és `f=`), OK.ru, VOE, Vidmoly, Filemoon/Byse |
| `onlinefilmek` | OnlineFilmek | `movie`, `tv` | `mp4`, `m3u8` | DooPlay REST/AJAX lejátszó opciók + hoster feloldók |
| `hdmozi` | HDMozi | `movie`, `tv` | `m3u8`, `mp4` | RPM AES-128-CBC HLS + Videa + DooPlay opciók |
| `dmdamedia` | DMDAMedia | `movie`, `tv` | `mp4`, `m3u8` | `?a=...` tabok, Filemoon/Byse, VOE, Vidmoly, StreamRuby, Videa, Indavideo |
| `sorozatok_net` | Sorozatok.net | `tv` | `mp4`, `m3u8` | Keresőindex + `go.php` Hunter dekódolás + átirányítás feloldás |
| `videa` | Videa.hu | `movie`, `tv` | `mp4` | Közvetlen Videa keresés + `_xt` RC4 XML dekódolás |
| `indavideo` | Indavideo.hu | `movie`, `tv` | `mp4` | Közvetlen Indavideo keresés + AMF JSON MP4 feloldás |
| `filmvilag` | Filmvilág2 | `movie` | `mp4`, `m3u8` | Keresőkatalógus + cikk beágyazások |
| `mediaklikk` | MédiaKlikk (MTVA) | `movie`, `tv` | `m3u8` | MTVA archív klasszikusok, AJAX keresés + közvetlen CDN HLS |
| `mesefilm` | Mesekincstár / Mesefilm | `movie`, `tv` | `mp4`, `m3u8` | Magyar rajzfilmek és mesefilmek szigorú játékidő/évszám szűréssel |
| `videakid` | Videakid | `movie`, `tv` | `mp4` | Gyerekbarát Videa tartalmak |

## Fejlesztés, fordítás és tesztelés

```bash
npm install
npm run build        # Mind a 13 Nuvio CJS ES2016 bundle generálása (providers/*.js) + biztonsági ellenőrzés
npm test             # Egységtesztek + szigorú QuickJS-szerű VM sandbox teszt mind a 13 csomagra
npm run test:live    # Élő integrációs füstteszt TMDB/IMDb azonosítókkal
```
