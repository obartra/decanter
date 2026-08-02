#!/usr/bin/env node
/* Build the sound lab: a page that plays every candidate sound side by side so
   the ones worth shipping can be chosen by ear rather than argued about.

   The candidates are CC0, from Kenney's packs (kenney.nl), which are public
   domain and explicitly free for commercial use with attribution optional. That
   matters more than it sounds: a sound library that wants credit puts a legal
   obligation into a game that currently has none, and most of the "free" sound
   sites are CC-BY rather than CC0.

   Everything here is derived. The packs are downloaded to a cache, the
   candidates are converted from them, and the page is generated from the
   manifest below. Nothing in `audio/` is hand-made, which is why it is gitignored
   rather than committed: only the handful that survive the audition should reach
   src/, and they should arrive one at a time with a reason.

   Needs ffmpeg on PATH. Ogg is what the packs ship; mp3 is what gets written,
   because Safari only learned Ogg Vorbis in 17 and this game is played on
   phones.

   Run: node tools/sound-lab/make.mjs [--force] */
import { mkdirSync, existsSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cache = join(here, '.packs');
const outDir = join(here, 'audio');
const FORCE = process.argv.includes('--force');

const PACKS = {
  impact: 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
  interface: 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
  rpg: 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip'
};

/* Already decided, so the lab shows them settled rather than asking twice, and
   so the same sound can be offered to the other game's cues as a shared
   candidate. Two games under one roof should not use two different noises for
   the same event. */
const CHOSEN = {
  'bubble.break': 'impactGlass_medium_000',
  'bubble.shoot': 'pluck_002',
  'bubble.stick': 'impactSoft_medium_000',
  'bubble.cut': 'glass_004',
  'bubble.advance': 'impactBell_heavy_002',
  'bubble.won': 'confirmation_002',
  'bubble.lost': 'glitch_002'
};

/* Which cue each candidate is auditioning for, and why the cue exists at all.
   Grouped this way because the question is never "is this a good sound", it is
   "is this a better <cue> than the one next to it". */
const CUES = [
  {
    key: 'break',
    title: 'Break',
    why: 'The matched group letting go. The one sound the game is built around, so it has to be glass and it has to be quick.',
    picks: [
      ['impact', 'impactGlass_light_000'], ['impact', 'impactGlass_light_002'],
      ['impact', 'impactGlass_medium_000'], ['impact', 'impactGlass_medium_002'],
      ['impact', 'impactGlass_heavy_000'], ['impact', 'impactGlass_heavy_002'],
      ['interface', 'glass_001'], ['interface', 'glass_003'], ['interface', 'glass_005']
    ]
  },
  {
    key: 'shoot',
    title: 'Shoot',
    why: 'Fires on every single shot, so anything with a tail turns a fast player’s game into a drone.',
    picks: [
      ['interface', 'pluck_001'], ['interface', 'pluck_002'], ['interface', 'click_003'],
      ['interface', 'select_004'], ['interface', 'switch_003']
    ]
  },
  {
    key: 'stick',
    title: 'Stick',
    why: 'Landed and matched nothing. This is the turn being spent, and it should be a little disappointing.',
    picks: [
      ['impact', 'impactSoft_medium_000'], ['impact', 'impactGeneric_light_000'],
      ['interface', 'drop_002'], ['interface', 'tick_002'], ['interface', 'bong_001']
    ]
  },
  {
    key: 'cut',
    title: 'Cut free',
    why: 'What came away with the match. Has to read as a consequence of the break rather than part of it.',
    picks: [
      ['interface', 'glass_002'], ['interface', 'glass_004'], ['interface', 'glass_006'],
      ['impact', 'impactGlass_light_004']
    ]
  },
  {
    key: 'advance',
    title: 'Advance',
    why: 'The board coming down a row. The only warning that the line is closer than it was, so low and a little unpleasant.',
    picks: [
      ['impact', 'impactWood_heavy_000'], ['impact', 'impactPlate_heavy_000'],
      ['impact', 'impactMetal_heavy_002'], ['impact', 'impactBell_heavy_002'],
      ['interface', 'close_002']
    ]
  },
  {
    key: 'won',
    title: 'Won',
    picks: [
      ['interface', 'confirmation_001'], ['interface', 'confirmation_002'],
      ['interface', 'confirmation_003'], ['interface', 'confirmation_004']
    ]
  },
  {
    key: 'lost',
    title: 'Lost',
    picks: [
      ['interface', 'error_002'], ['interface', 'error_004'],
      ['interface', 'glitch_002'], ['interface', 'question_003']
    ]
  }
];

/* The other game. Its cues are mostly the same shapes, so where one of the
   bubble picks fits it is offered here too and marked as shared: the two games
   share a room now, and a bottle set down should not sound like a different
   material from a sphere landing. */
const DECANTER = [
  {
    key: 'lift',
    title: 'Lift',
    why: 'A bottle picked up off the shelf. Also the confirm on every toggle, so it fires far more often than it looks.',
    picks: [
      ['impact', 'impactGlass_light_001'], ['interface', 'pluck_002'],
      ['interface', 'select_002'], ['rpg', 'cloth1'], ['rpg', 'handleSmallLeather']
    ]
  },
  {
    key: 'drop',
    title: 'Set down',
    why: 'The bottle going back on the shelf, and the cancel on a selection. The counterpart to lift, so the pair has to sound like one gesture reversed.',
    picks: [
      ['impact', 'impactGlass_light_003'], ['impact', 'impactSoft_medium_000'],
      ['rpg', 'dropLeather'], ['rpg', 'bookPlace1']
    ]
  },
  {
    key: 'deny',
    title: 'Refused',
    why: 'A pour that cannot be made, or a purse that cannot pay. It has to read as "no" without reading as an error the player caused.',
    picks: [
      ['interface', 'error_003'], ['interface', 'error_005'],
      ['interface', 'question_001'], ['rpg', 'metalClick']
    ]
  },
  {
    key: 'tick',
    title: 'Navigate',
    why: 'Moving between the map and a level. Pure interface, and the most frequent sound in the game, so it wants to be nearly nothing.',
    picks: [
      ['interface', 'click_002'], ['interface', 'select_006'],
      ['interface', 'switch_005'], ['interface', 'tick_001']
    ]
  },
  {
    key: 'cork',
    title: 'Corked',
    why: 'A bottle finished and stoppered. The single most satisfying moment in the game and the hardest to sample: nothing in these packs is a cork.',
    picks: [
      ['rpg', 'bookClose'], ['rpg', 'metalLatch'],
      ['interface', 'drop_003'], ['impact', 'impactSoft_medium_002']
    ]
  },
  {
    key: 'win',
    title: 'Level cleared',
    why: 'The same moment as the bubble game clearing its board, so the obvious answer is the same sound.',
    picks: [
      ['interface', 'confirmation_002'], ['interface', 'confirmation_003'],
      ['interface', 'confirmation_004']
    ]
  }
];

/* Cues that stay synthesised, and why. These are not oversights and the lab says
   so out loud, because "we forgot to pick one" and "a sample cannot do this" look
   identical from the outside. */
const KEPT = [
  ['Pour', 'The pour is not a sound, it is a parameter. pourAt(p) ramps three filter frequencies as the receiving bottle fills, and that rising pitch is the cue an ear uses to hear "filling". A sample is fixed at the moment it was recorded, so this one cannot be bought.'],
  ['Glug', 'Pitched from the same fill level, for the same reason. It also plays on every step of every pour, so a fixed sample would loop audibly within one bottle.'],
  ['Boom', 'Three layered voices tuned to arrive together, and nothing in the game is meant to make this noise anyway. Sampling it would cost bytes to sound worse.'],
  ['Unlock2', 'Defined in 50-audio.js and called from nowhere. Wants deleting rather than replacing.']
];

function fetchPacks(){
  mkdirSync(cache, { recursive: true });
  for (const [name, url] of Object.entries(PACKS)){
    const dir = join(cache, name);
    if (existsSync(dir) && !FORCE) continue;
    const zip = join(cache, `${name}.zip`);
    process.stdout.write(`  fetching ${name}\n`);
    execFileSync('curl', ['-sL', '--max-time', '120', '-o', zip, url]);
    rmSync(dir, { recursive: true, force: true });
    execFileSync('unzip', ['-oq', zip, '-d', dir]);
    rmSync(zip, { force: true });
  }
}

/* The packs put their audio in an Audio/ folder, but not all of them agree on
   the case or the depth, so the file is found rather than assumed. */
function sourceFor(pack, name){
  const root = join(cache, pack);
  const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  const hit = walk(root).find(f => f.endsWith(`/${name}.ogg`));
  if (!hit) throw new Error(`${pack}/${name}.ogg is not in the pack`);
  return hit;
}

const GAMES = [
  { game: 'bubble', title: 'Bubble', cues: CUES },
  { game: 'decanter', title: 'Decanter', cues: DECANTER }
];

/* One file per sound, not one per slot it is auditioning for. A sound offered to
   two cues is the same bytes, which is the point of offering it: if the two
   games are going to share a noise they should share the file. */
function everySound(){
  const seen = new Map();
  for (const { cues } of GAMES)
    for (const cue of cues)
      for (const [pack, name] of cue.picks) if (!seen.has(name)) seen.set(name, pack);
  return seen;
}

function convert(){
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const all = everySound();
  for (const [name, pack] of all){
    /* Mono at 96k. These are short, dry effects; stereo doubles the bytes and
       carries no information, since nothing here is positioned. */
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', sourceFor(pack, name),
      '-ac', '1', '-b:a', '96k', join(outDir, `${name}.mp3`)]);
  }
  return all.size;
}

/* How many cues, across both games, a given sound is up for. Anything over one
   is offered as shared and says so on the button. */
function usage(){
  const n = new Map();
  for (const { cues } of GAMES)
    for (const cue of cues)
      for (const [, name] of cue.picks) n.set(name, (n.get(name) || 0) + 1);
  return n;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function page(){
  const shared = usage();
  const sections = GAMES.map(({ game, title, cues }) => `
  <h1 class="game">${esc(title)}</h1>
  ${cues.map(cue => {
    const settled = CHOSEN[`${game}.${cue.key}`];
    return `
  <section class="cue${settled ? ' settled' : ''}" data-cue="${game}.${cue.key}">
    <h2>${esc(cue.title)}${settled ? ' <span class="done">decided</span>' : ''}</h2>
    ${cue.why ? `<p class="why">${esc(cue.why)}</p>` : ''}
    <div class="row">
      ${cue.picks.map(([, name]) => `
      <div class="pick${name === settled ? ' on' : ''}" data-src="audio/${name}.mp3" data-name="${esc(name)}">
        <button class="play" type="button">${esc(name.replace(/_/g, ' '))}${
          shared.get(name) > 1 ? '<em>shared</em>' : ''}</button>
        <button class="keep" type="button" title="mark as the one to ship">keep</button>
      </div>`).join('')}
    </div>
  </section>`;
  }).join('')}`).join('');

  const kept = `
  <h1 class="game">Staying synthesised</h1>
  <section class="cue note">
    ${KEPT.map(([t, why]) => `<p class="why"><b>${esc(t)}</b> &middot; ${esc(why)}</p>`).join('')}
  </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sound lab</title>
<style>
*{box-sizing:border-box}
body{
  margin:0; padding:28px 20px 60px; font-family:"Alegreya Sans",ui-sans-serif,system-ui,sans-serif;
  color:#EFE4D2; background:radial-gradient(125% 85% at 50% 0%, #2A1E13 0%, #150E08 52%, #0B0805 100%);
  min-height:100vh;
}
h1{font-family:Georgia,serif; font-size:24px; letter-spacing:.06em; text-transform:uppercase;
   color:#E0B15C; margin:0 0 4px}
h1.game{font-size:16px; letter-spacing:.22em; margin:34px 0 12px;
        padding-bottom:8px; border-bottom:1px solid rgba(224,177,92,.2)}
.lede{margin:0 0 26px; font-size:13px; color:#A2907A; max-width:60ch; line-height:1.6}
.done{font-family:inherit; font-size:8px; letter-spacing:.16em; color:#2A1B08;
      background:#E0B15C; border-radius:999px; padding:2px 7px; vertical-align:middle}
.cue.settled{opacity:.72}
.cue.settled:hover{opacity:1}
.cue.note .why{margin:0 0 10px}
.play em{font-style:normal; font-size:8px; letter-spacing:.14em; text-transform:uppercase;
         color:#E0B15C; margin-left:7px; opacity:.8}
h2{font-family:Georgia,serif; font-size:15px; letter-spacing:.14em; text-transform:uppercase;
   color:#F4D9A0; margin:0 0 4px}
.cue{margin:0 0 26px; padding:16px 16px 18px; border-radius:14px;
     border:1px solid rgba(224,177,92,.18); background:rgba(60,44,26,.22)}
.why{margin:0 0 12px; font-size:12px; color:#A2907A; max-width:70ch; line-height:1.6}
.row{display:flex; flex-wrap:wrap; gap:8px}
.pick{display:flex; align-items:stretch; border-radius:999px; overflow:hidden;
      border:1px solid rgba(224,177,92,.26); background:linear-gradient(180deg,rgba(60,44,26,.62),rgba(24,17,10,.52))}
.pick.on{border-color:#E0B15C; box-shadow:0 0 16px rgba(224,177,92,.3)}
button{font:inherit; color:inherit; background:none; border:0; cursor:pointer}
.play{padding:9px 14px; font-size:11px; letter-spacing:.08em}
.play:hover{color:#F4D9A0}
.pick.playing .play{color:#F4D9A0}
.keep{padding:9px 11px; font-size:9px; letter-spacing:.14em; text-transform:uppercase;
      color:#A2907A; border-left:1px solid rgba(224,177,92,.2)}
.pick.on .keep{color:#2A1B08; background:linear-gradient(180deg,#F6E0B0,#E0B15C 60%,#B8823A)}
.bar{position:fixed; left:0; right:0; bottom:0; padding:12px 20px; display:flex; gap:12px;
     align-items:center; background:rgba(11,8,5,.94); border-top:1px solid rgba(224,177,92,.2)}
.bar button{padding:9px 16px; border-radius:999px; font-size:10px; letter-spacing:.16em;
            text-transform:uppercase; border:1px solid rgba(224,177,92,.3)}
#out{flex:1; font-size:11px; color:#A2907A; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
</style>
</head>
<body>
<h1>Sound lab</h1>
<p class="lede">Every candidate for every cue, side by side. Click a name to hear it, click
<em>keep</em> to mark the one worth shipping. One keep per cue wins; marking a second
replaces the first. Anything marked <em>shared</em> is offered to a cue in the other game
too, and picking it in both means one file rather than two. Bubble is already decided and
shown that way; copy the picks when the rest is done.</p>
${sections}
${kept}
<div class="bar">
  <button id="copy" type="button">Copy picks</button>
  <span id="out">nothing picked yet</span>
</div>
<script>
const picks = {};
let current = null;
/* One audio element reused per source, so a fast clicker cannot stack twenty
   overlapping copies of the same effect and judge it on a sound it will never
   hear in the game. */
const cacheEl = new Map();
function play(src, el){
  if (current) current.classList.remove('playing');
  let a = cacheEl.get(src);
  if (!a){ a = new Audio(src); cacheEl.set(src, a); }
  a.currentTime = 0;
  a.play().catch(() => {});
  el.classList.add('playing');
  current = el;
  a.onended = () => el.classList.remove('playing');
}
function report(){
  const out = document.getElementById('out');
  const keys = Object.keys(picks);
  out.textContent = keys.length ? keys.map(k => k + ': ' + picks[k]).join('  ·  ') : 'nothing picked yet';
}
for (const pick of document.querySelectorAll('.pick')){
  const src = pick.dataset.src, name = pick.dataset.name;
  const cue = pick.closest('.cue').dataset.cue;
  /* what the page was generated already knowing, so the copied result is the
     whole answer rather than only the half decided in this sitting */
  if (pick.classList.contains('on')) picks[cue] = name;
  pick.querySelector('.play').onclick = () => play(src, pick);
  pick.querySelector('.keep').onclick = () => {
    const on = pick.classList.contains('on');
    for (const sib of pick.closest('.cue').querySelectorAll('.pick')) sib.classList.remove('on');
    if (on){ delete picks[cue]; } else { pick.classList.add('on'); picks[cue] = name; }
    report();
  };
}
/* Seeded above from what the page already knew, so the bar has to be told once
   at load. Without this, Copy picks silently returned only the cues decided in
   this sitting and the settled ones looked like they had been dropped. */
report();
document.getElementById('copy').onclick = async () => {
  const text = JSON.stringify(picks, null, 2);
  try { await navigator.clipboard.writeText(text); document.getElementById('out').textContent = 'copied: ' + text.replace(/\\s+/g, ' '); }
  catch (e) { document.getElementById('out').textContent = text.replace(/\\s+/g, ' '); }
};
</script>
</body>
</html>
`;
}

fetchPacks();
const n = convert();
writeFileSync(join(here, 'index.html'), page());
const cues = GAMES.reduce((s, g) => s + g.cues.length, 0);
const settled = Object.keys(CHOSEN).length;
console.log(`sound lab: ${n} sounds across ${cues} cues (${settled} already decided)`);
console.log('serve tools/sound-lab and open index.html');
