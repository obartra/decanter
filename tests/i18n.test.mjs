/* The languages, against each other.

   A translation goes wrong quietly. A missing key falls back to English and
   looks like a sentence somebody forgot to translate rather than a fault; a key
   nobody uses any more sits there being maintained; a placeholder dropped in one
   language produces `{level}` on a button. None of those fail anything on their
   own, so they fail here.

   What this deliberately does NOT check is whether the Catalan and the Castilian
   are any good. That needs somebody who speaks them, and the drafts in this
   repository have not had one yet. */
import { describe, it, equal, read } from './helpers.mjs';
import { en } from '../src/i18n/en.js';
import { es } from '../src/i18n/es.js';
import { ca } from '../src/i18n/ca.js';
import { LOCALES, say, pickLocale } from '../src/js/pure/08-say.js';

const TABLES = { en, es, ca };

describe('the languages', () => {
  it('has a table for every locale the game offers', () => {
    equal(LOCALES.sort(), Object.keys(TABLES).sort());
  });

  it('answers exactly the same keys in every language', () => {
    const keys = Object.keys(en).sort();
    for (const [loc, table] of Object.entries(TABLES)){
      const missing = keys.filter(k => !(k in table));
      const extra = Object.keys(table).filter(k => !(k in en));
      equal(missing, [], `${loc} is missing keys, and would quietly fall back to English`);
      equal(extra, [], `${loc} carries keys English has never heard of`);
    }
  });

  it('never leaves a translation empty', () => {
    for (const [loc, table] of Object.entries(TABLES)){
      const blank = Object.entries(table).filter(([, v]) => !String(v).trim()).map(([k]) => k);
      equal(blank, [], `${loc} has empty strings, which draw as nothing at all`);
    }
  });

  it('keeps every placeholder a sentence was written with', () => {
    /* A slot dropped in translation prints nothing where a number should be; a
       slot invented prints a brace. Both are only visible in that language. */
    const slots = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    const wrong = [];
    for (const [loc, table] of Object.entries(TABLES)){
      for (const k of Object.keys(en)){
        const a = slots(en[k]).join(), b = slots(table[k]).join();
        if (a !== b) wrong.push(`${loc}/${k}: English has {${a}}, this has {${b}}`);
      }
    }
    equal(wrong, [], 'a placeholder was dropped or invented in translation');
  });

  it('keeps the ids a script reaches for inside a translated sentence', () => {
    /* Two strings carry markup, because the sentence is broken across a tag the
       app fills in. Translating the id away leaves the app writing into nothing,
       and the sentence looks fine right up until the chapter name is missing. */
    const ids = s => [...String(s).matchAll(/id="([^"]+)"/g)].map(m => m[1]).sort();
    for (const [loc, table] of Object.entries(TABLES)){
      for (const k of Object.keys(en)){
        equal(ids(table[k]), ids(en[k]), `${loc}/${k} changed the ids inside it`);
      }
    }
  });

  it('marks every phrase in every shell, so none is left untranslatable', () => {
    /* The shells are where the words live. A node without a key is a sentence
       that will read English in every language, and nothing else would notice. */
    const shells = ['src/index.html', 'src/bubble/index.html',
                    'src/casks/index.html', 'src/measure/index.html'];
    const loose = [];
    for (const f of shells){
      let html = read(f).replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
      /* elements that own their markup answer for everything inside them */
      html = html.replace(/<([a-zA-Z0-9]+)[^>]*data-t-html[^>]*>[\s\S]*?<\/\1>/g, '');
      for (const m of html.matchAll(/(<[a-zA-Z0-9]+[^>]*>)([^<>]+)</g)){
        const text = m[2].trim();
        /* A phrase has letters in it. Counts the app overwrites, entities and
           punctuation are not sentences and have nothing to translate. */
        if (!/[a-zA-Z]/.test(text.replace(/&[a-z]+;|&#\d+;/g, ''))) continue;
        if (/data-t=/.test(m[1])) continue;
        loose.push(`${f}: "${text.slice(0, 40)}"`);
      }
    }
    equal(loose, [], 'a visible phrase carries no key, so it can never be translated');
  });

  it('falls back rather than printing a key at somebody', () => {
    const before = globalThis.LANG;
    globalThis.LANG = { 'settings': 'Ajustes' };
    equal(say('settings'), 'Ajustes', 'the shipped table wins');
    equal(say('done'), en['done'], 'a key it lacks falls back to English');
    equal(say('no-such-key-anywhere'), 'no-such-key-anywhere', 'and an unknown key is its own name');
    globalThis.LANG = before;
  });

  it('reads a browser language list the way browsers actually write one', () => {
    equal(pickLocale(['ca-ES-valencia', 'es-ES'], null), 'ca', 'a regional tag still names its language');
    equal(pickLocale(['es-419'], null), 'es');
    equal(pickLocale(['fr-FR', 'de'], null), 'en', 'a language the game does not speak falls back');
    equal(pickLocale(['fr'], 'ca'), 'ca', 'an explicit choice beats the browser');
    equal(pickLocale([], 'zz'), 'en', 'and a choice the game cannot honor is not one');
  });
});
