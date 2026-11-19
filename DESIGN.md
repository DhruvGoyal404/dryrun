# DryRun: design

The visual contract for every surface. `scripts/contrast.mjs` reads the colour table and
fails CI if any pair below WCAG 2.1 AA. Change a colour here first, then in
`web/src/styles/tokens.css`.

## The world: a dry run on paper

A student does a dry run in a ruled notebook: the code on the left page, on the right a
table of variables, an array drawn as boxes with arrows under it, a recursion tree
sketched in pencil, a value crossed out and rewritten. DryRun is that page, drawn by the
program itself.

- **Graph paper** is the ground of the canvas only: a quiet 24 px grid that tells you this
  is the drawing area. Panels with text (editor, output, controls) are plain sheet, no
  grid, so text never sits on lines.
- **Ink** (blue-black) is for structure: boxes, edges, text, values.
- **Pencil** (graphite grey) is for the secondary: indices under cells, labels, the parts
  of a tree not yet reached.
- **Blue ink** is for pointers: arrows under arrays, variable tags on nodes.
- **Red pen** marks *now*: the current line, the current call, the cell just written.
- **Highlighter** (yellow wash) marks what the last line wrote; a pale blue wash, what it
  read.
- **Green** is a returned call; **amber** a memo hit or a visited node.
- **Handwriting** (Caveat) appears only where a person would write by hand on the
  drawing: variable names and pointer labels on the canvas, and the wordmark. Never in
  controls, never for body text, never below 16 px.

Dark mode is the same notebook under a desk lamp: graphite paper, chalk-white ink, the
same pens a step brighter. It is chosen by `prefers-color-scheme`, overridable with the
theme toggle (remembered per browser).

## Colour

Columns: dark, light. Every text pair is 4.5:1 or better on the surfaces it sits on; every
UI part (control edges, focus) 3:1.

| Token | Dark | Light | Role |
|---|---|---|---|
| `--paper` | `#14171c` | `#f6f3ea` | Page and canvas ground |
| `--sheet` | `#1b1f26` | `#fcfaf4` | Panels: editor, input, output, timeline |
| `--grid` | `#20252d` | `#e4e6e3` | Graph-paper lines (decoration, no contrast duty) |
| `--rule` | `#2c323c` | `#ddd8cb` | Hairline separators between panels (decoration) |
| `--edge` | `#7a8290` | `#857f72` | Control borders, cell borders: 3:1 |
| `--ink` | `#ebe7dc` | `#1c2433` | Text, boxes, edges |
| `--pencil` | `#a9afba` | `#575e6c` | Secondary text, indices, pending nodes |
| `--blue` | `#8db0ff` | `#1f4fc4` | Pointers and variable tags |
| `--red` | `#ff8f80` | `#b42318` | Now: current line, call, write |
| `--green` | `#74d69f` | `#1d7543` | Returned |
| `--amber` | `#f0c35a` | `#8a5300` | Memo hit, visited |
| `--mark` | `#4b3f12` | `#fbe7a1` | Highlighter: written by the last line |
| `--read` | `#1e3254` | `#dde7fb` | Wash: read by the last line |
| `--focus` | `#ffb37a` | `#b4480e` | Focus ring, 2 px, offset 2 px |
| `--on-ink` | `#14171c` | `#fcfaf4` | Text on an ink-filled button |

Never a gradient, never a coloured glow. Shadows only on floating things (menus, the
shortcut sheet): one soft shadow with an offset.

## Type

Two families plus one outlier, self-hosted from `@fontsource-variable` (no font CDN):

| Role | Face | Sizes |
|---|---|---|
| Interface and prose | IBM Plex Sans (variable) | 14 px controls, 16 px body, 20 / 28 / 44 / 64 px headings (landing) |
| Code, values, numbers | JetBrains Mono (variable) | 14 px editor and cells, 13 px dense tables; tabular figures |
| Hand annotations | Caveat (variable) | 18 to 22 px canvas labels; the wordmark |

Headings are Plex Sans 600, sentence case, tracking -0.01 em at 44 px and above. Labels
are Plex Sans 14 px, sentence case, never tracked capitals. Body measure 65 to 72 ch.
Numbers in counters and cells use tabular figures.

## Space and shape

- 4 px base: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Radius: 6 px on controls, 4 px on cells and nodes' boxes, 999 px on pills (step
  counter only). One radius per nesting level.
- Container: landing content capped at 1120 px, centred; the app is full-bleed with
  16 px gutters.
- Borders: 1 px `--rule` between panels; 1.5 px `--edge`/`--ink` for drawn boxes.

## Layout: the app

```
+--------------------------------------------------------------------+
| DryRun (hand)   Library  Compare            Share  Theme  ?        |
+---------------------------+----------------------------------------+
| editor (CodeMirror)       | canvas (graph paper)                   |
|  line hit heatmap gutter  |  one drawing per detected structure,   |
|  red bar on current line  |  each labelled by hand with its name   |
|---------------------------|                                        |
| input: stdin | call       |  frames: the call stack and locals     |
| [ Run ]   output          |  (the fallback variables panel)        |
+---------------------------+----------------------------------------+
| |< < > >|  play  speed  [====o==========]  step 41 / 120   counters |
+--------------------------------------------------------------------+
```

- Desktop (>= 1024 px): two columns, 5 : 7, timeline full width at the bottom.
- Tablet (640 to 1023 px): same, 1 : 1.
- Phone (< 640 px): tabs "Code" and "Dry run" at the top; the timeline stays pinned at the
  bottom of both.

## Motion

- Stepping: a changed cell's highlighter wash fades in over 160 ms (ease-out); a pointer
  arrow slides to its new cell over 180 ms. Nothing else moves.
- Play runs at 1, 2, 4 or 8 steps per second.
- `prefers-reduced-motion: reduce`: no transitions at all, and play still works.
- No entrance animations on the landing page; one authored moment: the hero drawing steps
  through a real trace when the visitor presses its step button.

## Components

- **Primary button** (Run, Open the app): ink fill, `--on-ink` text, 6 px radius. One per
  view.
- **Secondary button**: transparent, 1 px `--edge` border, ink text.
- **Icon buttons** (timeline): 36 px square targets (44 px on touch), drawn SVG icons, one
  1.75 px stroke, with a visible label in a tooltip and an `aria-label`.
- **Cells**: 40 x 40 px mono, 1.5 px ink border; index below in pencil 12 px mono.
- **Nodes**: tree and graph nodes are 36 px circles (graph) or 40 x 28 px boxes (lists),
  1.5 px ink stroke; state shows as fill wash plus a text cue, never colour alone.
- **States** every control has: rest, hover, focus-visible, active, disabled, loading
  (Run while Pyodide loads shows its progress), error (the error panel names the line).

## Accessibility

- WCAG 2.1 AA in both themes, checked by axe in the e2e suite.
- Every drawing has a text equivalent: each view's SVG has a title and a short
  description of its state ("nums, pointers left at 2 and right at 5"), and the frames
  panel lists every variable as text.
- The current step is announced politely ("Step 41 of 120, line 7") on demand, not on
  every play tick.
- Keyboard: every control has a shortcut, listed in the "?" sheet.
