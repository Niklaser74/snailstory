# Snail Story

Femte spelet i snigelserien på snails.se. En snigel i ett terrarium, i verklig
tid: ägget kläcks efter 90 sekunder, snigeln lever i tre år, och den kan inte dö
av vanskötsel — den bommar igen skalet och väntar. Dagboken skriver en rad per
dygn och är det spelet handlar om.

Byggstegsfritt PWA: ES-moduler, Canvas, inga npm-beroenden. Bor på
`snails.se/snailstory/` under hubben (`Niklaser74/Niklaser74.github.io`).

## Kör

| Vad | Kommando |
| --- | --- |
| Lokal server | `npm start` → http://localhost:8085/ |
| Tester | `npm test` |
| Hämta renderare från Snäckmageddon | `npm run sync:game` (default `../dev-snailmageddon`) |
| Ikoner (SVG → PNG) | `npm run icons` (lånar hubbens Playwright) |
| Produktionslayout | i hubbrepot: `PORT=8081 node scripts/serve.mjs --mount /snailstory=../dev-snailstory` |

## Struktur

```
js/life.js      Life: behov, dvala, växande, krypsträcka, dygnsposter, märken. Noll DOM
js/diary.js     dygnspost → i18n-nycklar + parametrar. Ingen text lagras
js/fmt.js       mm/dygn/år formaterade per språk, delat av dagbok och paneler
js/view.js      terrariet: rummet, fönstrets himmel, lådan, snigeln på sin bana
js/main.js      laddning, de fem knapparna, paneler, notiser, PWA
js/i18n.js      sv/en inklusive alla dagbokens meningar (nycklar 'd.*')
js/push.js      påminnelser: prenumerera och lämna snigelns schema hos servern
js/supa.js      anonymt Supabase-konto och RPC, inget bibliotek
js/game/        KOPIOR från snailmageddon — rör aldrig, kör sync:game
test/           handrullade tester utan ramverk, node:assert
supabase/       migration och edge-funktion för påminnelserna — se dess README
```

## Konventioner

- **Bara relativa sökvägar.** Allt på snails.se delar origin; `test/paths.test.mjs` vaktar.
  Enda absoluta är manifestets `id: "/snailstory/"`.
- **Egen namnrymd:** cache `snailstory-vN` i `sw.js`, `localStorage` `snailstory.*`, manifest-id `/snailstory/`.
- **Nya JS-filer läggs i `sw.js`** — `test/sw.test.mjs` säger till.
- **`life.js`, `diary.js` och `fmt.js` importerar aldrig DOM, canvas eller `game/audio.js`.**
  Det är det som gör `test/life.test.mjs` möjlig — den lever hela treårsliv i millisekunder.
- **All slump hashas ur `(seed, tick)`**, aldrig ur en löpande generator. Annars blir
  snigeln olika beroende på hur ofta appen öppnats, och det syns direkt i
  path-independence-testet.
- **Vanskötsel får aldrig döda.** Enda stället som sätter `dead` är ålderdom i `advanceTo`.
  Lägger du till ett nytt behov: det ska kunna sätta `asleep`, aldrig `dead`.
- **Dvalan fryser allt.** I `step()` returnerar den sovande grenen innan något räknas ned.
- **Dagboken lagrar inga meningar**, bara dygnets siffror i `days[]`. Texterna genereras
  vid visning, så språkbytet skriver om hela dagboken.
- **En matsort får aldrig inleda en mening** i dagboken — svenskans och engelskans
  genus och bestämdhet spelar inte ihop. Skriv om meningen i stället.
- All UI-text via `t()`, svenska och engelska samtidigt; `test/rules.test.mjs` kräver nyckelparitet.
- Svenska först i HTML, engelska via `data-i18n`.
- Takt och balans är konstanter överst i `life.js` — ändra där, inte inline.
- **Påminnelserna schemaläggs i förväg, servern speglar aldrig snigeln.** Klienten
  räknar ut när något inträffar (`life.schedule`) och ersätter hela listan hos servern.
  Ny sorts påminnelse: lägg till i `REMINDER_KINDS`, i migrationens check-villkor och i
  `supabase/functions/snailstory-notify/texts.js` — testerna kräver att de tre är överens.
- **Notistexter hör hemma i `texts.js`, inte i `js/i18n.js`.** En notis skrivs av servern.
- **Sessionsnyckeln `snackmageddon.session` är medvetet oprefixad** — samma origin,
  samma projekt, samma konto som resten av serien. Enda undantaget från prefixregeln.
- **Allt i `push.js` och `supa.js` är best effort.** Spelet ska fungera utan nät, utan
  konto och utan notisrättighet; inget därifrån får kasta in i spelet.
- `docs-vault/` (Obsidian) och `.claude/` committas aldrig.

## Rör inte

- `js/game/*` — kopior. Ändra uppströms i snailmageddon och kör `npm run sync:game`.
- `manifest.id` — appens identitet på den delade originen.
- `TICK_MS` — sparfilen räknar tick, och en ändring flyttar varje befintlig snigel i tiden.

## Felsökning

`window.snailstory.skip(dagar)` i konsolen drar tillbaka födelsedatumet och
spelar upp livet, så en tre år gammal snigel går att titta på direkt.

## Innan du är klar

- `npm test` grönt.
- Bumpa `VERSION` i `sw.js` och `APP_VERSION` i `js/config.js` när något som skeppas ändrats.
- Push till `main` deployar direkt via Pages — titta på `npm start` först.
