/* What the game says, and in which language.

   The tables live in src/i18n. Only one of them is ever shipped to a player: the
   build writes a small script per locale that puts it on `globalThis.LANG`, and
   the shells for that locale load it before the app. A network boundary is the
   one thing a global is for here, the same reason `Sound` is one.

   English is the fallback for a key the shipped table has never heard of, which
   should be impossible — a test compares the tables key for key — and is still
   better than the key itself appearing on a button.

   Pure, so this cannot read `document` or `navigator`: which locale a page IS
   was decided when the page was built, and which one a player WANTS is read from
   the save by 90-app.js. This only answers what the words are. */
import { en } from '../../i18n/en.js';

export const LOCALES = ['en', 'es', 'ca'];
/* the one every other table is measured against, and the fallback */
const DEFAULT_LOCALE = LOCALES[0];

/* `es-419`, `ca-ES-valencia` and `en-GB` are all answerable; anything else is
   not, and asking for a language the game does not speak is not an error. */
export function pickLocale(preferred, wanted){
  if (LOCALES.includes(wanted)) return wanted;
  for (const tag of (preferred || [])){
    const base = String(tag).toLowerCase().split('-')[0];
    if (LOCALES.includes(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/* One sentence, with anything in braces filled in.

   Braces rather than positions, because a translation moves them: the pour
   count comes before the par in English and after it in neither, but the day
   will come. A slot with nothing to fill it is left as it was written rather
   than becoming `undefined` on somebody's screen. */
/* Which language the page is showing. Set at boot and again whenever the player
   changes it, which is why this is a variable rather than a constant read of the
   shipped file: switching happens on the screen the player is looking at. */
let current = DEFAULT_LOCALE;
export const locale = () => current;
export function setLocale(loc){
  current = LOCALES.includes(loc) ? loc : DEFAULT_LOCALE;
  return current;
}

export function say(key, vars){
  const tables = globalThis.LANGS || { en };
  const table = tables[current] || tables.en || en;
  const text = (key in table) ? table[key] : en[key];
  if (text == null) return key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

/* The English source, for the test that compares the tables and for the build,
   which needs to know every key before it has picked a locale. */
export { en as SOURCE };
