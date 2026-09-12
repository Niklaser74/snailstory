// The sentences the reminders are made of. Plain JS with no imports, so the
// edge function (Deno) and test/push.test.mjs (Node) read the same file and the
// wording cannot drift between what is tested and what is sent.
//
// These are deliberately not in the game's js/i18n.js: that file is loaded by
// the page, and a notification is written by the server.
export const TITLE = 'Snail Story';

export const KINDS = ['hatch', 'sealed', 'birthday', 'death'];

export function body(kind, lang, name, years = 0) {
  if (lang === 'en') {
    return kind === 'hatch' ? `${name} has hatched.`
      : kind === 'sealed' ? `${name} has sealed its shell. Water and food will wake it.`
      : kind === 'birthday' ? `${name} turns ${years} today.`
      : `${name} reached three years and has gone.`;
  }
  return kind === 'hatch' ? `${name} har kläckts.`
    : kind === 'sealed' ? `${name} har bommat igen skalet. Vatten och mat väcker den.`
    : kind === 'birthday' ? `${name} fyller ${years} år i dag.`
    : `${name} blev tre år och har somnat in.`;
}

// A snail can be left nameless, and the notification still has to read as Swedish.
export const fallbackName = (lang) => (lang === 'en' ? 'Your snail' : 'Snigeln');

// One tag per kind, so a birthday never quietly replaces "it has sealed up".
export const tagFor = (kind, years) => `snailstory-${kind}${years || ''}`;
