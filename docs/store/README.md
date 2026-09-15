# Butikstexter och pressbilder

Vad som finns här, och var spelet hör hemma. Snäckmageddon har samma mapp med
tre butiker i; Snail Story har färre, och skälen står nedan.

| Fil | Vad |
| --- | --- |
| `itch.md` | Sidtext för itch.io, svenska och engelska |
| `screenshots/` | Pressbilder, genereras med `npm run shots` |
| `../../icons/og-1200x630.png` | Delningsbilden, genereras med `npm run og:image` |

## Bilderna genereras, de fotograferas inte

```bash
npx playwright install chromium   # en gång, i hubbrepot
npm run og:image                  # icons/og-1200x630.png
npm run shots                     # docs/store/screenshots/*.png
```

Båda scripten stagar terrariet genom `scripts/pose.mjs`: fasta seeds och en
fast omgång skötsel, så samma kommando ger samma bild varje gång. En
skärmbild som blir en annan bild vid varje körning är en skärmbild ingen vågar
ta om, och då åldras den i stället.

Bilderna visar riktiga spelbilder, inte montage. Vill man ändra vad som syns
ändrar man poseringen i `pose.mjs` — inte bilden i efterhand.

## itch.io

Ja, men som **skyltfönster med en länk**, inte som inbäddat spel. itch serverar
HTML-spel från sin egen domän, vilket ger ett annat `localStorage` och därmed en
annan snigel, och påminnelserna slutar fungera eftersom kontot hör till
snails.se. För ett spel som handlar om att samma djur lever i tre år vore det
att sälja bort själva poängen. Detaljerna står i `itch.md`.

## Google Play

Serien har redan **en** app på Play: ett tunt TWA-skal (`se.snails.app`) som
visar snails.se. Snail Story finns alltså där inne redan, utan att något behöver
göras.

En egen listning skulle kräva ett eget paketnamn, ett eget TWA-skal med
`start_url` på `/snailstory/` och en egen uppsättning butikstexter — och sedan
konkurrera med seriens egen app om samma spel. Det är en marknadsfråga, inte en
teknisk, och därför inte gjord. Underlaget finns om det blir aktuellt:
`../../../dev-snailmageddon/docs/store/google-play.md` beskriver hela
Bubblewrap-kedjan.

## Poki

Nej. Poki bygger på korta sessioner i en spelkatalog man surfar mellan, och
spelet är en treårig långsam följetong utan session att avsluta. Det skulle få
underkänt i deras QA av rätt skäl, och det vore rätt.
