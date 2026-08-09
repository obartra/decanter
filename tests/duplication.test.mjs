/* The duplication detector, with something duplicated in front of it.

   Same shape as the dead code suite next door and for the same reason: a
   detector that reports nothing is indistinguishable from a detector that is
   broken, and this one is not a gate, so nothing else would ever notice it had
   stopped working. It runs once a week into an issue, which is exactly the kind
   of check that can quietly answer "all clear" for a year.

   So each test puts a known copy in front of it and asserts it is found, and the
   false positives it was tuned against are asserted to stay unfound. */
import { describe, it, assert, root } from './helpers.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

/* The tool reads the real source tree, so a fixture means a source tree of its
   own: a temporary copy with the tool pointed at it. `modulesOf` walks folders,
   so the shape has to match what a game looks like. */
function scan(files){
  const dir = mkdtempSync(join(tmpdir(), 'dupe-'));
  try {
    mkdirSync(join(dir, 'src/js/pure'), { recursive: true });
    for (const [name, body] of Object.entries(files)){
      mkdirSync(join(dir, 'src/js', name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : ''), { recursive: true });
      writeFileSync(join(dir, 'src/js', name), body);
    }
    return execFileSync(process.execPath, [join(root, 'tools/duplication.mjs')],
      { cwd: dir, encoding: 'utf8', env: { ...process.env, DUPLICATION_ROOT: dir } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* Six lines of real work, so it clears both the run length and the character
   floor. Two names differ, which is what a copy actually looks like. */
const block = tag => `
export const Thing${tag} = (() => {
  function shape(list){
    const seen = new Map();
    for (const item of list){
      const key = item.name + ':' + item.kind;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(item.value);
    }
    return [...seen.entries()].map(([k, v]) => ({ key: k, count: v.length }));
  }
  return { shape };
})();
`;

describe('duplication detector', () => {
  it('finds the same block in two shipped modules', () => {
    const out = scan({ '10-one.js': block('One'), '20-two.js': block('Two') });
    assert(/10-one\.js/.test(out) && /20-two\.js/.test(out),
      `both copies should be named:\n${out}`);
  });

  it('says nothing when the two modules merely resemble each other', () => {
    const other = `
export const Other = (() => {
  function total(rows){
    let sum = 0;
    for (const row of rows) sum += row.weight * row.count;
    return sum;
  }
  return { total };
})();
`;
    const out = scan({ '10-one.js': block('One'), '20-two.js': other });
    assert(/no duplication/.test(out), `nothing should have been reported:\n${out}`);
  });

  it('does not report a run of imports, which is the module system', () => {
    /* The false positive it was tuned against: a game's entry point and its app
       import the same modules in the same order because they are supposed to. */
    const imports = `
import { A } from './pure/00-a.js';
import { B } from './pure/10-b.js';
import { C } from './pure/20-c.js';
import { D } from './pure/30-d.js';
import { E } from './pure/40-e.js';
import { F } from './pure/50-f.js';
`;
    const out = scan({ '10-one.js': imports, '20-two.js': imports });
    assert(/no duplication/.test(out), `imports are not duplicated logic:\n${out}`);
  });

  it('does not report prose, however alike two comments are', () => {
    /* This repository writes more comment than code and two modules explaining
       the same decision in the same words is the house style, not a defect. */
    const prose = n => `/* ${'The same paragraph, written out at length so it clears the floor. '.repeat(4)} */
export const P${n} = ${n};
`;
    const out = scan({ '10-one.js': prose(1), '20-two.js': prose(2) });
    assert(/no duplication/.test(out), `comments are not code:\n${out}`);
  });

  it('reports the real tree without falling over', () => {
    /* Not an assertion about how much duplication there is, which is a moving
       number and is the weekly job's business. This asserts the tool runs
       against the sources as they are and produces a report at all, because a
       crash and a clean bill of health look the same from a workflow. */
    const out = execFileSync(process.execPath, [join(root, 'tools/duplication.mjs'), '--ci'],
      { cwd: root, encoding: 'utf8' });
    assert(/NEEDS_ATTENTION=(true|false)/.test(out), `no verdict in:\n${out.slice(0, 400)}`);
    assert(/shipped modules|duplicated lines/.test(out), `no report in:\n${out.slice(0, 400)}`);
  });
});
