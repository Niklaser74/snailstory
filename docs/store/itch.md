# itch.io – sidtext och inställningar

**Titel:** Snail Story
**Kort beskrivning (tagline):** Sköt om en snigel i verklig tid. Den gör nästan ingenting, och den lever i tre år.
**Klassificering:** HTML5-spel, gratis (betala vad du vill, förslag 20 kr)
**Genre:** Simulation · Taggar: idle, pet, real-time, cozy, snails, diary, pwa, swedish, incremental
**Omslag:** `cover-630x500.png` · Skärmdumpar: `screenshots/*.png` (genereras med `npm run shots`)

## Länka, embedda inte

Till skillnad från de andra spelen i serien ska den här sidan **länka till
snails.se/snailstory/**, inte bädda in spelet. Skälet är inte lathet utan att
en inbäddning aktivt skulle skada spelet:

- itch serverar HTML-spel från en egen domän (`html-classic.itch.zone`). Det är
  en annan origin, alltså ett **annat `localStorage`** — snigeln man sköter på
  itch är inte samma snigel som på snails.se. För ett spel vars hela poäng är
  att samma djur lever i tre år är det förödande.
- **Påminnelserna slutar fungera.** Prenumerationen och kontot hör till
  snails.se. I en iframe på en främmande domän finns varken det ena eller det
  andra, och notisen när ägget kläcks är halva anledningen att spela.
- Ändrar itch något i sin hosting kan tre års snigel vara borta. Det är inte en
  risk värd att ta för lite extra synlighet.

Sätt alltså **Kind of project: HTML** men ladda inte upp något spelbart, eller
välj en sida utan filer, och lägg länken först i beskrivningen. Sidan är ett
skyltfönster, inte en spelplats.

## Beskrivning (svenska)

**Spelas på [snails.se/snailstory](https://snails.se/snailstory/)** — gratis, i
webbläsaren, går att installera på hemskärmen.

Det ligger ett snigelägg i en kruka jord. Ge det ett namn, så kläcks det om
nittio sekunder. Sedan lever snigeln i **tre år av verklig tid**. Den växer,
kryper och sover medan appen är stängd, och när du kommer tillbaka har den
gjort ungefär ingenting, mycket noggrant.

Den **kan inte dö av att du glömmer den**. Blir det torrt eller tomt på mat
bommar den igen skalet med ett membran och väntar — precis som riktiga sniglar
gör i månader när de måste. Du förlorar växandet, aldrig snigeln. Bara
ålderdomen tar den, efter tusen nittiofem dygn.

Det du gör är fem saker: dimma, mata, lägga i kalk, torka glaset och klappa.
Klappar du den drar den in ögonstjälkarna, för det gör sniglar.

**Dagboken är spelet.** Varje dygn skriver en rad om sig självt, och den är
tråkig med flit:

> **Dag 147.** 3,30 m avklarat. Sedan vilade den hela dagen, vilket är
> begripligt. Skalet mätte 34,7 mm på kvällen.

- Det får plats **tre sniglar**. De delar vatten och mat men lever var sitt liv, och möts de på glaset kryper de på varandra
- Sniglar är hermafroditer, så två fullvuxna kan para sig och **båda** lägger ägg. En unge får stanna och ärver skalfärg, mönster och namn — efter Majken kommer Majken II
- **Notiser** när ägget kläcks, när snigeln bommar igen skalet, på födelsedagarna och när de tre åren är slut. Även när appen är stängd
- 22 märken, varav ett tar tre år
- Fungerar offline, kan installeras som app, inget konto krävs
- Svenska och engelska

Gratis och utan reklam. Vill du stötta utvecklingen får du gärna betala vad du
vill.

## Description (English)

**Played at [snails.se/snailstory](https://snails.se/snailstory/)** — free, in
the browser, installable on your home screen.

There is a snail egg in a pot of soil. Give it a name and it hatches in ninety
seconds. After that the snail lives for **three years of real time**. It grows,
crawls and sleeps while the app is closed, and when you come back it has done
almost nothing, very thoroughly.

It **cannot die of neglect**. If the box runs dry or out of food, the snail
seals its shell with a membrane and waits — which is exactly what real snails do
for months when they have to. You lose the growing, never the snail. Only old
age ends it, after one thousand and ninety-five days.

There are five things you can do: mist, feed, add chalk, wipe the glass, and pet
it. Pet it and it pulls its eye stalks in, because that is what snails do.

**The diary is the game.** Every day writes one line about itself, and it is
dull on purpose:

> **Day 147.** 3.30 m covered. Then it rested all day, which is
> understandable. The shell measured 34.7 mm by evening.

- The terrarium holds **three snails**. They share the water and the food but live their own lives, and when they meet on the glass they climb over each other
- Snails are hermaphrodites, so two grown ones can mate and **both** lay eggs. One hatchling stays and inherits its shell, its pattern and its name — after Majken comes Majken II
- **Notifications** when the egg hatches, when the snail seals its shell, on the birthdays, and when the three years are up. Even with the app closed
- 22 badges, one of which takes three years
- Works offline, installs as an app, no account needed
- Swedish and English

Free and ad-free. If you would like to support the work, pay what you want.

## Konton och länkar

- Utvecklare: Knackpot AB, Hofors
- Serien: [snails.se](https://snails.se) — Snäckmageddon, Snäckschack, Snailman, Snigelkrattan, Snail Story
- Integritetspolicy: https://snails.se/privacy.html

## Att inte skriva

Fredagsdiscot står medvetet inte i texten. Det är tre timmar i veckan med
partyhattar och discoljus, och det är roligare att upptäcka än att bli lovad.
