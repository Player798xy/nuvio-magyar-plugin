# Nuvio Magyar Plugin (`nuvio-magyar-plugin`)

Közvetlen, **proxy nélküli** egységes Nuvio JS Plugin magyar szinkronos és feliratos filmekhez, sorozatokhoz, rajzfilmekhez és élő MTVA/MédiaKlikk adásokhoz. Minden scraper és hoster dekódoló közvetlenül a felhasználó eszközén (QuickJS / React Native Hermes runtime alatt, külső HTTP szerver nélkül) fut le.

## Telepítés a Nuvio alkalmazásban

1. Nyisd meg a **Nuvio** alkalmazásban a **Plugins / Bővítmények** menüt.
2. Add hozzá a tároló nyers `manifest.json` URL-jét:

```text
https://raw.githubusercontent.com/Player798xy/nuvio-magyar-plugin/main/manifest.json
```

3. A Nuvio **egyetlen** tiszta forrásként (`🇭🇺 Magyar`, `providers/magyar.js`) tölti be az összes magyar oldalt, így többé nem keveredik szét 13 külön fülre az angol pluginok között.

## Működés: egységes forrás + okos minőségszűrés és rendezés

A `providers/magyar.js` központi aggregátor egyetlen közös TMDB/Cinemeta metaadat-lekérdezés után párhuzamosan futtatja a hazai forrásokat (`NetMozi`, `JobbMintATV`, `Filmezek`, `OnlineFilmek`, `HDMozi`, `DMDAMedia`, `Sorozatok.net`, `Videa.hu`, `Indavideo.hu`, `Filmvilág2`, `MédiaKlikk`, `Mesekincstár`, `Videakid`), majd a `finalizeStreams` modul automatikusan kitisztítja a listát:

- **Szigorú sorrend:** először **Magyar Szinkron**, azon belül csökkenő felbontás szerint (`2160p → 1440p → 1080p → 720p → 480p`, azonos felbontásnál `HLS` előrébb az `MP4`-nél), majd szükség esetén `Magyar Felirat`.
- **Gyenge minőség elrejtése:** ha létezik legalább egy `720p` vagy `1080p` streames találat, a `240p`, `360p` és `480p` találatok automatikusan eltűnnek (nem szemetelik tele a listát).
- **Azonos feltöltések összevonása:** egy videófájl vagy embed több felbontása (`1080p + 720p + 480p + 360p + 240p`) nem jelenik meg 5 külön kártyaként — feltöltésenként csak a legjobb minőség marad meg, portálokon átívelő duplikációszűréssel, legfeljebb 10 válogatott streammel.

## Eszközön belüli közvetlen hoster dekódolók (`src/_shared/`)

Proxy nélküli futtatásnál az IP/ASN-kötött lejátszó-tokenek közvetlenül a kliens IP-címére generálódnak, `X-Forwarded-For` vagy proxy kényszer nélkül:

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
npm run build        # Egységes Nuvio CJS ES2016 bundle generálása (providers/magyar.js) + runtime biztonsági ellenőrzés
npm test             # Egységtesztek + szigorú QuickJS-szerű VM sandbox teszt (magyar.js + mind a 13 almodul)
npm run test:live    # Élő integrációs füstteszt valós filmekre, sorozatokra és élő adásra
```
