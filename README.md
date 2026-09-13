# Snail Story

Sköt om en snigel. Den gör nästan ingenting.

Ägget kläcks efter en och en halv minut, och snigeln lever sedan i **tre år av
verklig tid** — den växer, kryper och sover medan appen är stängd. Den kan
**inte dö av vanskötsel**: blir det torrt eller tomt på mat bommar den igen
skalet med ett membran och väntar, precis som riktiga sniglar gör i månader när
det behövs. Du förlorar växandet, aldrig snigeln. Bara ålderdomen tar den.

Varje dygn skriver sig självt in i dagboken, en rad i taget:

> **Dag 147.** 3,30 m avklarat. Sedan vilade den hela dagen, vilket är
> begripligt. Skalet mätte 34,7 mm på kvällen.

Femte spelet i [snigelserien](https://snails.se) från Knackpot. Live på
[snails.se/snailstory/](https://snails.se/snailstory/).

## Kör

| Vad | Kommando |
| --- | --- |
| Lokal server | `npm start` → http://localhost:8085/ |
| Tester | `npm test` |
| Uppdatera `js/game/` från Snäckmageddon | `npm run sync:game` |
| Ikoner | `npm run icons` |

Byggstegsfritt: ren HTML, CSS och ES-moduler, inga beroenden. Spelet behöver
varken server eller konto — det enda undantaget är påminnelser, som är
frivilliga och beskrivs nedan. Hela repot deployas till GitHub Pages vid push
till `main`.

## Struktur

```
index.html      enda sidan: terrariet, behovsmätare, de fem knapparna, panelerna
js/life.js      HELA spelet som tal: behov, dvala, växande, krypsträcka. Noll DOM
js/diary.js     en dagbokspost per dygn, hämtad ur dygnets sparade siffror
js/view.js      terrariet på canvas: rummet, fönstret, lådan, snigeln
js/fmt.js       millimeter, dygn och år som en snigelskötare säger dem
js/i18n.js      sv/en, inklusive alla dagbokens meningar
js/push.js      påminnelser: prenumerera, och lämna snigelns schema hos servern
js/supa.js      minimal Supabase-klient: anonymt konto och RPC, inget bibliotek
js/main.js      laddning, knappar, paneler, notiser, PWA
js/game/        KOPIOR från snailmageddon — rör aldrig, kör sync:game
test/           paths, rules, life, diary, push, sw
supabase/       migration och edge-funktion för påminnelserna
```

## Så hänger det ihop

**Tiden är en rutnätsklocka.** Livet är kvantiserat till femminuterssteg räknade
från kläckningen. Att öppna appen efter en månad betyder att 8 640 steg spelas
upp, vilket tar några millisekunder. Allt slumpmässigt hashas ur `(seed, tick)`
i stället för att dras ur en löpande generator, så snigeln är densamma oavsett
hur appen kom dit: ett långt hopp eller tusen korta. `test/life.test.mjs` kör
båda vägarna och jämför.

**Fyra behov, ett resultat.** Fukt, mat, kalk och renhet räknas ned var för sig
och vägs ihop till en kvalitet som bara påverkar en sak: hur fort skalet växer
mot fyra centimeter. Inget av dem kan döda.

**Dvalan är inte ett strafftillstånd.** När fukten eller maten bottnar sätts
`asleep`, och då står allting stilla — behoven sjunker inte, smutsen växer inte,
skalet växer inte. Det är därför en glömd snigel ser likadan ut efter en månad
som efter en vecka.

**Snigelns plats i lådan är krypsträckan.** Lådans insida är en rundad rektangel
på ungefär en meter, och positionen är `distance mod omkrets`. En meter på
mätaren är ett varv längs golv, glas, tak och tillbaka. Ingen position att spara
och ingenting som kan hamna ur fas med simuleringen.

**Klappar man den drar den in ögonstjälkarna.** Stjälkarna åker in på en
fjärdedels sekund och kommer tillbaka ut under fem, och snigeln sitter still
lite längre än så. Indragningen är en parameter i seriens `drawSnail`, inte
något Snail Story målar över huvudet.

**Sniglar är nattdjur.** Mellan nio på kvällen och sex på morgonen rör den sig;
på dagen sitter den still. Fönstret bakom lådan visar den riktiga himlen, så det
syns direkt vilken tid på dygnet spelet befinner sig i.

## Notiser

Slår du på påminnelser hör spelet av sig när ägget kläcks, när snigeln bommar
igen skalet, på födelsedagarna och när de tre åren är slut — även när appen är
stängd.

Det kräver ingen server som vakar över snigeln. Snigelns framtid är
deterministisk så länge du inte gör något, så appen räknar själv ut när varje
sak inträffar och lämnar en lista med tider hos Supabase; ett cron-jobb skickar
det som förfallit. Prognosen för dvalan kör den riktiga simuleringen framåt på
en slängkopia, så den kan inte glida ifrån verkligheten — och listan ersätts
varje gång du varit inne, så den är alltid senaste ordet.

Påminnelser är det enda spelet använder nätet till. Väljer du bort dem görs
inte ett enda anrop. Slår du på dem skapas ett osynligt konto utan namn,
e-post eller lösenord, och stänger du av dem raderas både prenumerationen och
kalendern. Detaljerna: `supabase/README.md`.

## Sökvägar och origin

Spelet ligger på `snails.se/snailstory/`; hubben äger roten. Därför bara
relativa sökvägar, egen cache-prefix (`snailstory-`), egna `localStorage`-nycklar
(`snailstory.*`) och eget manifest-id (`/snailstory/`).

## Nästa steg

- Speltesta på riktigt över några dygn och justera takten: fuktens och matens
  livslängd, hur snabbt skalet växer, hur ofta den kryper.
- Ägg och avkomma: två spelares sniglar som blir föräldrar. Sniglar är
  hermafroditer, så vem som helst kan para sig med vem som helst.
- OG-bild och butikstexter.
