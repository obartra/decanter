/* What the game says, and in which language.

   The tables live in src/i18n. Only one of them is ever shipped to a player: the
   build writes a small script per locale that puts it on `globalThis.LANG`, and
   the shells for that locale load it before the app. A network boundary is the
   one thing a global is for here, the same reason `Sound` is one.

   English is the fallback for a key the shipped table has never heard of, which
   should be impossible — a test compares the tables key for key — and is still
   better than the key itself appearing on a button. It is read out of the
   shipped tables rather than imported: this module is bundled twice, and
   importing a dictionary would put a second copy of one in the deferred bundle
   for no reason at all.

   Pure, so this cannot read `document` or `navigator`: which locale a page IS
   was decided when the page was built, and which one a player WANTS is read from
   the save by 90-app.js. This only answers what the words are. */

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
/* Which language the page is showing, kept on the page rather than in this
   module.

   It has to live outside, because this module is bundled twice: the app needs it
   and so does the preview card, which is fetched after the page opens. A module
   level `let` would give those two copies a locale each, and the card would open
   in English while everything behind it was in Spanish — which is precisely the
   defect the "bundled exactly once" test exists to catch, and why that test's
   allowance is only for modules with no state. This one now has none. */
export const locale = () => (LOCALES.includes(globalThis.LOCALE) ? globalThis.LOCALE : DEFAULT_LOCALE);
export function setLocale(loc){
  globalThis.LOCALE = LOCALES.includes(loc) ? loc : DEFAULT_LOCALE;
  return globalThis.LOCALE;
}

export function say(key, vars){
  const tables = globalThis.LANGS || {};
  const source = tables.en || {};
  const table = tables[locale()] || source;
  const text = (key in table) ? table[key] : source[key];
  if (text == null) return key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

