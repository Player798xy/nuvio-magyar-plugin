# Nuvio Magyar Pluginok (`nuvio-magyar-plugin`)

Közvetlen, **proxy nélküli** Nuvio JS Plugin csomag magyar szinkronos és feliratos filmekhez, sorozatokhoz, rajzfilmekhez és élő MTVA/MédiaKlikk adásokhoz. Minden scraper és hoster dekódoló közvetlenül a felhasználó eszközén (QuickJS / React Native Hermes runtime alatt, külső HTTP szerver nélkül) fut le.

## Telepítés a Nuvio alkalmazásban

1. Nyisd meg a **Nuvio** alkalmazásban a **Plugins / Bővítmények** menüt.
2. Add hozzá a tároló nyers `manifest.json` URL-jét:

```text
https://raw.githubusercontent.com/Player798xy/nuvio-magyar-plugin/main/manifest.json
```

3. A Nuvio automatikusan betölti a 13 magyar forrást a `providers/*.js` csomagokból.

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

## Eszközön belüli közvetlen hoster dekódolók (`src/_shared/`)

Proxy nélküli futtatásnál az IP/ASN-kötött lejátszó-tokenek közvetlenül a kliens IP-címére generálódnak, és nincs `X-Forwarded-For` vagy proxy kényszer:

- **NetMozi LinkPayload v1/v2**: tisztán JS FNV-1a + `xorshift32` dekódoló (`src/_shared/crypto_decoders.js`)
- **VOE** (és tükördomainek): 5 lépcsős ROT13 + regex tisztítás + Base64 + karaktereltolás dekódoló
- **RPM (`rpmshare`, `rpmstream`, `rpmvid`)**: AES-128-CBC hex dekódolás `crypto-js`-szel
- **Filemoon / Byse**: WebCrypto (`crypto.subtle`) AES-256-GCM + beépített tiszta JS NIST SP 800-38D (GHASH/GCTR) fallback QuickJS-hez
- **P.A.C.K.E.R. & Hunter**: univerzális kliensoldali JS kicsomagolók (Vidmoly, StreamRuby, LuluVid, MixDrop, Vidara, vTube, Streamwish, Sorozatok.net)
- **Videa / Videakid / Indavideo / OK.ru**: RC4 `_xt`, `f=` noembed fallback, AMF JSON, OK.ru zárolt HLS + MP4 feloldás
- **MédiaKlikk**: közvetlen `player.mediaklikk.hu` `.m3u8` kivonás (külső `.m3u8` proxy nélkül)

## Fejlesztés, fordítás és tesztelés

```bash
npm install
npm run build        # Összes Nuvio CJS ES2016 bundle generálása (providers/*.js) + runtime biztonsági ellenőrzés
npm test             # Egységtesztek + szigorú QuickJS-szerű VM sandbox teszt mind a 13 csomagra
npm run test:live    # Élő integrációs füstteszt TMDB/IMDb azonosítókkal
```

### Runtime kompatibilitási szabályok (`build.js`)

A build folyamat automatikusan tiltja a következő Node-specifikus vagy proxy-függő hívásokat a `providers/*.js` fájlokban:
- `require('tls')`, `require('crypto')`, `require('http')`, `require('https')`, `require('fs')`, `require('path')`, `require('zlib')`
- Globális `Buffer.*`, `AbortSignal.timeout(...)`, `Response.arrayBuffer()`
- Keménykódolt IP spoof fejlécek (`X-Forwarded-For`, `Client-IP`, `X-Real-IP`)
