# Decanter, design notes

A water sorting puzzle. Bottles hold four units of coloured liquid, stacked. Pour
between bottles until every bottle holds a single colour. It runs entirely
offline, installs to a home screen, and makes no network calls.

These notes are split by **decision domain**, not by file, and each domain is
owned by exactly one document. Anything written down twice will drift, so where
two areas meet the boundary is named in both and the detail lives on one side of
it.

## The documents

| | Owns |
| --- | --- |
| [01 Puzzle](design/01-puzzle.md) | The laws of the game: what a pour is, when one is legal, when a level is solved |
| [02 Levels](design/02-levels.md) | What you get dealt: generation, determinism, difficulty, chapters |
| [03 Par and the solver](design/03-par.md) | The true minimum for a board, and how it is known |
| [04 Economy](design/04-economy.md) | Stars, failure, gold in and out, every price and the invariants holding them |
| [05 Playing a level](design/05-playing.md) | A session end to end: input, undo, restart, vessel, the HUD, how a level ends |
| [06 Bottles and liquid](design/06-bottles.md) | How a bottle and its contents are drawn, at rest and while tipped |
| [07 The pour](design/07-pour.md) | What happens on screen during a move, and the queue that sequences it |
| [08 The room](design/08-room.md) | The drawn backdrop, and how it aligns itself to the board |
| [09 The map](design/09-map.md) | Getting between levels: geometry, the road, chapters, unlocking |
| [10 Visual system](design/10-visual-system.md) | Colour and type, and the single sources that keep them consistent |
| [11 Sound](design/11-sound.md) | Synthesised audio, and why it is synthesised |
| [12 Saving](design/12-saving.md) | The save file: schema, migration, and surviving a bad one |
| [13 Delivery](design/13-delivery.md) | Build, offline, installation, and picking up a new version |
| [14 Testing](design/14-testing.md) | How this is verified, and what it deliberately cannot verify |
| [14b CI](design/14b-ci.md) | Which checks gate a change, and why those |
| [15 Diagnostics](design/15-diagnostics.md) | Answering "it did nothing when I tapped it", offline |
| [16 The Measure](design/16-measure.md) | The decanting puzzle at `/measure/`: its rules, its exact par, and why it grades the opposite way round |
| [17 The Cellar Door](design/17-casks.md) | The sliding puzzle at `/casks/`: its rules, why its boards are generated backwards, and why they ship as a table |
| [18 The lab](design/18-lab.md) | The workbench at `/lab/`: live parameters, level navigation, and the difficulty measurements |

## Where the seams are

A few boundaries are worth naming, because they are the ones that blur:

- **Puzzle (01)** owns the rules. **Par (03)** owns what those rules imply about
  the best possible play. **Economy (04)** owns what that play is worth.
- **Bottles (06)** owns what liquid looks like. **The pour (07)** owns what
  happens when a move is made. The liquid's own level change belongs to 06; the
  stream, the tilt and the sequencing belong to 07.
- **The room (08)** owns generated scenery. **The map (09)** owns navigation and
  progression. The cobbled road is documented in 09, because it exists to sit on
  the nodes and is drawn from their geometry.
- **Playing (05)** owns the lifecycle and what the HUD shows. **Economy (04)**
  owns the numbers it is showing.

## Layout of the repo

Kept in one place, in [the README](../README.md#what-is-where), rather than here
as well. This table listed two of the six source directories and described the
solver as "shipped verbatim into the page", which stopped being true when the
build started hashing it into its own file — a table maintained in two places
drifts in exactly the way these documents are organised to prevent.
