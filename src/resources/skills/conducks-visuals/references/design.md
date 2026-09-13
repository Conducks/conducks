# design — what these pages look like, and why that is a rule and not a taste

Read this when writing or changing `system.css`, when adding a class, when a page "looks bad" without
anybody being able to say which line is wrong, or when porting the stylesheet into a project.

`system.css` is **shared byte-for-byte across every project** (`references/setup.md` §1). So every
rule here changes in all of them at once, and a local tweak is a fork.

## Contents

- 1 · Tokens — one set, and it covers both themes
- 2 · Type — two faces, three roles, one scale
- 3 · State is a shape, never a hue
- 4 · The drawing uses the page's tokens
- 5 · Spend the boldness once
- 6 · The checklist

---

## 1 · Tokens — one set, and it covers both themes

Every colour on every page comes from a named variable. **A raw hex outside `:root` is a defect**,
however good it looks.

*Failure behind it.* One stylesheet declared twelve tokens and then wrote `#1a2028`, `#0f1318`,
`#11161c`, `#0f2a26` and `#241708` inline through the rest of the file. Nothing looked broken. But a
token set that is bypassed cannot be re-themed, so the page had a light mode that was one variable
away and permanently out of reach.

The set, by role — not by colour name, because `--blue` is a token that cannot be re-themed either:

| role | tokens | for |
|---|---|---|
| ground | `--paper` `--card` `--sunk` | the page, a raised surface, a recessed one |
| ink | `--ink` `--ink-2` `--ink-3` | body, secondary, the muted slot anchors live in |
| rules | `--rule` `--rule-2` | hairlines, and the heavier one under a heading |
| meaning | one hue per meaning, each with a **soft** companion | the pill's text and the pill's background |

**Both themes, always.** Define the full light palette on bare `:root`; redefine only the tokens
under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`; redefine
them again under `:root[data-theme="dark"]` so an explicit toggle wins in both directions. A colour
whose only definition lives inside a media block has no value in the other theme.

*Failure behind it.* A sheet shipped 323 lines with **zero** `prefers-color-scheme` rules and a
hardcoded near-black ground. It was not a dark-mode design; it was a design with one mode, and the
half of readers who print or read in daylight got the wrong one with no way to say so.

**Do not borrow a product's palette.** That same sheet used `#58a6ff`, `#3fb950`, `#f85149` and
`#d29922` — GitHub's own accent, success, danger and attention, exactly. A page wearing another
product's colours reads as that product's page, and every project built to this standard then looks
like a GitHub screenshot rather than like itself.

## 2 · Type — two faces, three roles, one scale

**Two families, maximum. Three roles, fixed.**

| role | face | carries |
|---|---|---|
| display | a face chosen for this project | h1, h2, big numbers |
| body | a sans, or a serif with more line-height | prose |
| receipt | one mono | every `file:line`, symbol, id, count, tag and pill |

The mono role is load-bearing here in a way it is not on an ordinary page: **the mono means "this is
checkable"**. An anchor set in the body face reads as prose and stops being a receipt.

*Failure behind it.* One sheet had exactly one `font-family` declaration in 323 lines and it was the
mono. Everything else was the platform default stack — so the page had no voice, and there was
nothing to distinguish a heading from a heading somewhere else.

**One scale, and it is monotonic.** Every step down is smaller than the step above it. The same sheet
set h1 27px, h2 19px and **h3 14px against 15px body** — a heading smaller than the text it heads,
which is why its sections read as if they had no structure at all.

**No tracked ALL-CAPS eyebrow above every heading.** It is the commonest generated-page tell, it
costs a line of vertical space per section, and it never says anything the heading did not. One
tracked mono label is allowed where it carries real data — a stage number, a provenance tag — and
never as decoration.

## 3 · State is a shape, never a hue

`traced` · `measured` · `UNVERIFIED` · `live` · `absent` — every one renders as a **pill**: mono, a
soft background of its own hue, its text in the strong version of that hue.

*Failure behind it.* A sheet rendered state as coloured bold text — `.y` green, `.n` red, `.c`
amber. Colour alone is not a channel: it disappears for a colour-blind reader, in a greyscale print,
and in a screenshot pasted into a document. A pill survives all three, because the shape carries the
meaning and the colour only reinforces it.

The same rule governs the `absent` class on the canvas, which is the highest-value mark these pages
make. It must be legible with the colour removed.

## 4 · The drawing uses the page's tokens

The SVG classes — the block fills, the edge strokes, the container frames — resolve to the **same**
variables as the prose around them. A second palette for the picture is the same defect as a second
renderer, one layer down: the drawing then re-themes independently of the page it sits in, and one of
the two is always wrong.

This is also why `references/setup.md` forbids inline `fill` / `stroke` / `font` attributes. An
inline attribute outranks the class silently, and the element leaves the token system without
changing appearance — so nothing tells you until the theme flips.

## 5 · Spend the boldness once

One thing on a page may be the memorable thing. Everything around it is quiet: hairlines, a small
type scale, one accent, generous space. A page where the cards, the callouts, the pills and the
headings each want attention has no hierarchy, and a reader's eye lands nowhere.

The canvas is the memorable thing on the architecture page. The prose pages have none by default,
and that is correct — they are read, not admired.

## 6 · The checklist

Before a stylesheet change ships to every project:

| # | check |
|---|---|
| 1 | Zero raw hex values outside `:root` and its two theme blocks |
| 2 | Light and dark both defined; every token has a value in each |
| 3 | No colour taken from another product's brand palette |
| 4 | At most two families, plus the mono. Every `file:line` is mono |
| 5 | The type scale is monotonic — no heading smaller than body |
| 6 | No tracked ALL-CAPS label that carries no data |
| 7 | Every state is a pill, and legible with colour removed |
| 8 | The SVG classes resolve to the page's own tokens |
| 9 | The file diffs clean against every other project that shares it |
