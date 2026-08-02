import { describe, it, assert, equal, loadPure } from './helpers.mjs';

/* `Still` is numbered with the browser code because that is where the thing it
   feeds lives, but it only builds strings, so it can be asked directly what it
   would draw rather than being photographed in a browser. */
const { Still, Rules } = loadPure(['78-still.js']);

/* how much of the glass the liquid fills, as a fraction, read back off the
   markup the way a stylesheet would */
const filled = tube =>
  [...Still.bottle(tube).matchAll(/height:([\d.]+)%/g)]
    .reduce((sum, m) => sum + Number(m[1]), 0) / 100;

describe('a board drawn small', () => {
  it('draws a bottle as full as it actually is', () => {
    /* The bug this pins. The blast's shelf drew its own bottles with every band
       taking an equal share of the glass, so a bottle holding one unit and a
       bottle holding four were the same picture, on the one screen whose only
       question is which bottle to destroy. */
    for (let units = 0; units <= Rules.CAP; units++){
      const tube = Array.from({ length: units }, (_, i) => i % 3);
      const want = units / Rules.CAP;
      assert(Math.abs(filled(tube) - want) < 1e-6,
        `${units} of ${Rules.CAP} units drew ${filled(tube)} of the glass, wanted ${want}`);
    }
  });

  it('gives every unit its own colour, in the order the bottle holds them', () => {
    const colours = [...Still.bottle([2, 5, 5, 0]).matchAll(/var\(--c(\d+)\)/g)].map(m => m[1]);
    equal(colours, ['2', '5', '5', '0']);
  });

  it('paints nothing at all for an empty bottle', () => {
    equal(Still.bottle([]), '');
  });

  it('marks a finished bottle, so a part-solved board does not read as a mistake', () => {
    const done = Still.pour([[1, 1, 1, 1], [1, 2]]);
    equal((done.match(/stillBottle done/g) || []).length, 1);
    equal((done.match(/stillBottle(?! done)/g) || []).length, 1);
  });

  it('lays a big shelf out in two rows rather than one thin ribbon', () => {
    const cols = tubes => Number(/--stillCols:(\d+)/.exec(Still.pour(tubes))[1]);
    const shelf = n => Array.from({ length: n }, () => [0]);
    equal(cols(shelf(6)), 6, 'a small board is one row');
    equal(cols(shelf(8)), 8);
    equal(cols(shelf(14)), 7, 'fourteen bottles are seven and seven');
    equal(cols(shelf(9)), 5, 'an odd one over goes on the end of the first row');
  });

  it('staggers the other game\'s rows the way the board says, not by counting', () => {
    /* `j % 2` outside the bubble game's grid is the bug that module warns about,
       so which rows are indented is handed over rather than worked out here. */
    const rows = [
      { indent: false, cells: ['#111', null] },
      { indent: true, cells: [null, '#222'] }
    ];
    const html = Still.bubbles(rows);
    equal((html.match(/stillRow odd/g) || []).length, 1);
    equal((html.match(/stillDot/g) || []).length, 4, 'an empty cell still holds its place');
    assert(html.includes('#111') && html.includes('#222'), 'the colours handed over are the ones drawn');
  });
});
