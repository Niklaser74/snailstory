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
| Delningsbild | `npm run og:image` → `icons/og-1200x630.png` |
| Pressbilder | `npm run shots` → `docs/store/` |
| Snigel för hand (till någon som tappat sin) | `npm run snail -- --name Majken --days 74` |
| Produktionslayout | i hubbrepot: `PORT=8081 node scripts/serve.mjs --mount /snailstory=../dev-snailstory` |

## Struktur

```
js/life.js      Box: de fyra behoven, klockan, upp till tre Life. Life: en snigels eget. Noll DOM
js/diary.js     dygnspost → i18n-nycklar + parametrar. Ingen text lagras
js/fmt.js       mm/dygn/år formaterade per språk, delat av dagbok och paneler
js/view.js      terrariet: rummet, fönstrets himmel, lådan, snigeln på sin bana
js/main.js      laddning, de fem knapparna, paneler, notiser, PWA
js/i18n.js      sv/en inklusive alla dagbokens meningar (nycklar 'd.*')
js/push.js      påminnelser: prenumerera och lämna snigelns schema hos servern
js/backup.js    säkerhetskopian: packa, läsa och vägra. Noll DOM
js/egg.js       äggkoden mellan två terrarier: koda, avkoda och vägra. Noll DOM
js/cloud.js     kopian på kontot: ladda upp, lista, hämta. Best effort, noll DOM
js/supa.js      anonymt Supabase-konto och RPC, inget bibliotek
js/game/        KOPIOR från snailmageddon — rör aldrig, kör sync:game
test/           handrullade tester utan ramverk, node:assert
supabase/       migration och edge-funktion för påminnelserna — se dess README
docs/store/     butikstext och pressbilder — se dess README
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
- **Vanskötsel får aldrig döda.** Enda stället som sätter `dead` är ålderdom i `Life.finish`.
  Lägger du till ett nytt behov: det ska kunna sätta `asleep`, aldrig `dead`.
- **Behoven är lådans, inte snigelns.** `Box` äger fukt, mat, kalk och smuts och är den
  enda klockan; `Life` äger storlek, krypsträcka, dvala, dagbok och sin död. Nytt fält:
  fråga vem som skulle äga det i en riktig låda med tre sniglar.
- **Behoven räknas ned lika fort oavsett antal sniglar.** En snigel till ska vara ett liv
  till att följa, inte tre gånger pysslet.
- **`Life.tick` är snigelns egen**, `boxTick - bornTick`, så en snigel som läggs till
  senare får rätt ålder och rätt `(seed, tick)`-hash.
- **Märken tillhör lådan**, inte en snigel: samma hylla för alla tre, vunna när någon av
  dem klarar villkoret.
- **Parning är lådans sak, inte en snigels.** `Box.courtship()` letar par varje tick;
  `Life` bär bara följderna (`gravidTick`, `mate`, `parents`). Den som lägger ägg gör det
  i lådans jord, så kullarna ligger på `Box.clutches`.
- **Båda parterna blir med ägg.** De är hermafroditer, och det är hela poängen med att
  ha funktionen. Går det någonsin att bara en blir gravid är det en bugg.
- **En snigel parar sig aldrig med sin förälder** (`parentSeeds`). Namn kan bytas, seeds
  kan det inte, så kontrollen går på seed.
- **En unge ärver namnet som en regent**: `heirName` i `life.js` tar en förälders namn
  och nästa romerska siffra. Ren funktion, testad i `rules.test.mjs`.
- **`Box.usedNames` är namnräkningens minne**, inte hyllan med tidigare sniglar. Den
  innehåller även de bortgångna, så en linje fortsätter räkna; den är per låda, så ett
  nytt terrarium får använda namnen igen. Lådan döper sina egna ungar — sidan erbjuder
  bara att byta.
- **En födelse skrivs från båda hållen**: ungens dag noll säger vems den är, och
  `Box.noteHatch` lägger dagen i dagboken hos föräldern som grävde ner kullen.
- **Dagboken kan ha flera anmärkningsvärda rader samma dygn** — en kull som går ner
  medan en annan kommer upp. `entryFor` samlar dem i stället för att returnera den
  första som slår till.
- **Lådans mått bor i `life.js`** (`BOX_W`, `BOX_H`, `LAP`): simuleringen frågar vem som
  står bredvid vem i samma millimeter som vyn ritar i. `view.js` äger bara `placeOnPath`.
- **Vem som kryper på vem bestäms av `stackLayout` i `view.js`**, en ren funktion som
  testas i `rules.test.mjs`. Den som kommer bakifrån klättrar. Tröskeln är ungefär ett
  skals bredd: överlappande fötter är naturligt, krockande skal är det inte.
- **Fredagsdiscot får inte påverka något.** `isDisco` styr ljus, hatt och en dagboksrad
  och ingenting annat: ingen fart, ingen tillväxt, inga behov. Blir det någonsin en
  spelmekanik har skämtet gått förlorat.
- **Vyns zoom är en transform runt hela scenen**, inte en omräkning av `px()/py()`.
  Allt ritas i scenkoordinater; `applyZoom` och `snailAt` är de enda som vet om den.
- **Dvalan fryser snigeln, inte lådan.** I `Life.live()` returnerar den sovande grenen innan
  något växer eller kryper; `Box.decay()` fortsätter oavsett, för avdunstning bryr sig inte.
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
- **Lådan syncar inte, kontot delas.** Terrariet bor i `localStorage` (ett per webbläsare);
  kontot är seriens och gäller över enheter. Därför bär påminnelserna ett `device`-handtag:
  en synk ersätter bara den egna webbläsarens rader. Allt som skrivs per konto måste fråga
  sig om två lådor kan slåss om det.
- **Bilder genereras, de fotograferas inte.** `scripts/pose.mjs` stagar terrariet med
  fasta seeds och en fast omgång skötsel, så `npm run og:image` och `npm run shots` ger
  samma bilder varje gång. Ändra vad som syns i poseringen, aldrig i bilden efteråt.
- **Säkerhetskopian är oformaterad JSON, med flit.** En fil någon ska spara i tre år ska gå
  att öppna, läsa, mejla till sig själv och laga för hand. Base64 eller gzip hade sparat två
  tredjedelar av en dryg hundra kilobyte och köpt ingenting för det.
- **En inläsning ersätter hela tillståndet** — lådan, hyllan med tidigare sniglar och
  `savedAt` — och går alltid genom `backup.parse`, som bygger lådan för att bevisa att filen
  går att läsa och hellre vägrar än läser in halvt. En halvt återställd låda i stället för en
  levande är värre än ingen säkerhetskopia alls. Nytt fält i sparfilen: inget behöver göras,
  kopian är hela `box.toJSON()` — men bumpa `FILE_VERSION` om formatet slutar gå att läsa bakåt.
- **Ägg kan ges bort, sniglar kan det inte.** Det som byts mellan spelare är överskottet
  ur en kull — allt utom en unge gick ändå ut i trädgården. Ett ägg bär släkt, färg och
  mönster men **ingen dagbok**, så ingens treåriga snigel kan dupliceras, och eftersom
  äggen är gratis finns ingen knapphet att vakta: ingen server behövs, koden fungerar
  offline. Vill någon flytta ett *levande* djur är det en kopia, inte ett byte, så länge
  inte kontot äger snigeln.
- **En gåvounge är inte född här.** `Life.gift` skiljer dem åt, och märket `born` kräver
  `!s.gift`. Nya märken som handlar om vad dina egna sniglar gjort måste fråga sig samma
  sak, annars går de att vinna med en kod någon annan skrivit.
- **Äggkoden är kodad, till skillnad från sparfilen.** Den lever i minuterna mellan två
  chattmeddelanden och ingen läser den; där väger det tyngre att en avhuggen kod vägras
  än att den går att laga för hand. Kontrollsumman finns mot tappade tecken, inte mot fusk
  — vem som helst kan skriva en egen kod, och det gör ingenting.
- **Mottagaren lottar vilken förälder ungen brås på**, inte givaren. Koden bär båda
  färgerna och båda mönstren; `receiveEgg` drar med samma regel som en kull som kläcks
  hemma. Givaren ska inte kunna se vad hen skickade.
- **Kopian på kontot är en kopia, aldrig en synk.** Lådan laddas upp ungefär en gång om
  dygnet och skrivs *aldrig* tillbaka av sig själv: den hämtas med ett tryck och samma
  fråga som en fil. Två lådor på ett konto får var sin rad (`device` i primärnyckeln) och
  kan därför inte skriva över varandra. Automatisk spegling vore samma kapplöpning som
  påminnelsekalendern hade i september, fast med ett helt terrarium som insats.
- **Ladda aldrig upp vid `pagehide`.** En sparfil är hundratals kilobyte; `keepalive`
  tillåter 64 kB och utan den hinner anropet inte klart. En uppladdning som ser ut att
  ske men avbryts är värre än ingen alls. Uppladdningen sker medan appen är öppen.
- **Ett lyckat anrop, inte ett försök, får flippa reglaget.** `cloud.enable` returnerar
  tidsstämpeln servern lagrade, och knappen tror på svaret. Allt mot nätet är best effort,
  och best effort plus en glad toast är hur en spelare slutar oroa sig för en kopia som
  aldrig gjordes.
- **Den automatiska uppladdningen skapar aldrig ett konto.** Bara keeparens eget tryck
  gör det (`force`). Ett dygnsjobb är inget skäl att registrera någon för något.
- **Rutan säger att ett anonymt konto inte överlever enheten.** Kontot bor självt i
  `localStorage`; utan Google eller e-post dör kopian med telefonen. Att dölja det hade
  gjort funktionen till en lugnande ljudeffekt.
- **Notiser levereras per konto, inte per enhet** — datorsnigeln hörs av på telefonen, och
  det är avsiktligt.
- **Ta aldrig bort en RPC-signatur i samma steg som klienten byter till en ny.** Spelet är
  en PWA med cache-first service worker: första öppningen efter en deploy kör fortfarande
  gammal kod. Lägg till den nya signaturen, låt den gamla ligga kvar en release, och låt
  den nya sopa undan det den gamla skrev. `rules.test.mjs` vaktar just det här fallet.
- **`js/account.js` är seriens delade klient, vendorad från hubben** (`npm run
  sync:account`; `supa.js` re-exporterar den) — redigera den aldrig här.
  Sessionsnyckeln `snails.session` är medvetet oprefixad: samma origin, samma
  projekt, samma konto som resten av serien. Enda undantaget från prefixregeln.
- **Allt i `push.js` och `supa.js` är best effort.** Spelet ska fungera utan nät, utan
  konto och utan notisrättighet; inget därifrån får kasta in i spelet.
- `docs-vault/` (Obsidian) och `.claude/` committas aldrig.

## Rör inte

- `js/game/*` — kopior. Ändra uppströms i snailmageddon och kör `npm run sync:game`.
- `manifest.id` — appens identitet på den delade originen.
- `TICK_MS` — sparfilen räknar tick, och en ändring flyttar varje befintlig snigel i tiden.

## Felsökning

`window.snailstory.skip(dagar)` i konsolen drar tillbaka hela terrariet och
spelar upp det, så tre år gamla sniglar går att titta på direkt.
`window.snailstory.add('Namn')` lägger ett ägg till.
`window.snailstory.raise(dagar)` spolar tillbaka och spelar upp med skötsel två
gånger om dygnet — **inte idempotent**, varje anrop drar tillbaka lådan ytterligare
en gång, så ladda om mellan försöken — enda sättet att se en vuxen, parande låda utan att vänta ett
år. `.box` är lådan, `.sel` den valda snigeln.

## Innan du är klar

- `npm test` grönt.
- Bumpa `VERSION` i `sw.js` och `APP_VERSION` i `js/config.js` när något som skeppas ändrats.
- Push till `main` deployar direkt via Pages — titta på `npm start` först.
