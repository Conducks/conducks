<!-- description: Typography rules — type scale tokens, font pairing discipline, line length, hierarchy, and what never to do with type. -->

# Presentation — Typography Rules

> Typography is not decoration. It is the structure of information.

---

## Type scale

All font sizes come from tokens in `globals.css`. No one-off sizes in components.

```css
:root {
  --text-xs:   11px;   /* labels, captions, fine print */
  --text-sm:   13px;   /* secondary text, metadata */
  --text-base: 15px;   /* body copy, default */
  --text-md:   17px;   /* slightly prominent body */
  --text-lg:   20px;   /* section headings, card titles */
  --text-xl:   24px;   /* page sub-headings */
  --text-2xl:  30px;   /* page headings */
  --text-3xl:  36px;   /* hero or major feature headings */

  --leading-tight:  1.25;
  --leading-normal: 1.5;
  --leading-loose:  1.75;

  --tracking-tight:  -0.02em;
  --tracking-normal:  0em;
  --tracking-wide:    0.04em;  /* use only for ALL CAPS labels — sparingly */
}
```

**TYP-1 — No one-off font sizes** `[severity: high]`
Every font size used in a component must map to a token. If you need a new size, add it to the scale in `globals.css`. Never write `font-size: 18px` in a component.

---

## Font pairing

**TYP-2 — Two fonts maximum** `[severity: medium]`
One for headings, one for body. If a single font handles both well, use one. Three fonts is noise, not richness.

**TYP-3 — No serif+sans-serif pairing as a premium shortcut** `[severity: medium]`
Mixing serif headings with sans-serif body text is a visual cliché for "we want to look premium." If you use a serif, it must be a deliberate, project-specific decision — not a default gesture.

**TYP-4 — Load only what you use** `[severity: medium]`
If using a web font, load only the weights and subsets actually used. No `font-weight: 100 900` variable font imports when you use 400 and 600 only.

---

## Hierarchy

Typographic hierarchy communicates importance. There are at most four levels in any view:

| Level | Token | Usage |
|---|---|---|
| Primary | `--text-2xl` or `--text-3xl` | Page title, one per view |
| Secondary | `--text-xl` or `--text-lg` | Section headings |
| Body | `--text-base` | Main content |
| Supporting | `--text-sm` or `--text-xs` | Labels, captions, metadata |

Never skip levels. Never create hierarchy through font size alone — weight, color, and spacing must work together.

---

## Line length

Body text line length: 60–75 characters. At `--text-base` (15px), that is roughly 560–680px column width.

Lines shorter than 45 characters fragment reading. Lines longer than 80 characters strain it. Neither is acceptable for sustained body copy.

---

## Weight rules

**TYP-5 — Two weights are almost always enough** `[severity: low]`
Regular (400) and medium or semibold (500–600) covers the vast majority of interfaces. Bold (700) is for genuine emphasis — a warning, a price, a key data point. Not a heading style.

**TYP-6 — No ultra-thin weights for body text** `[severity: medium]`
Font weight 100–300 on body text fails readability at small sizes and on non-Retina displays. Use 400 minimum for any text the user must read.

---

## Typography anti-patterns (banned)

- Uppercase labels with `letter-spacing` used decoratively — this is an eyebrow, and eyebrows are banned
- Mixed serif and sans-serif as a shortcut to "premium" with no intentional reason
- Font sizes outside the defined scale
- Line heights below 1.4 for any body text
- Text-shadow on body copy
- Centered body text blocks longer than two lines
- Italic as a decorative default — reserve it for genuine emphasis or citations
- Font weight changes as the only hover feedback (use color instead)

---

## Technical Checklist

- [ ] Type ramp defined in `globals.css` using tokens (`--text-base`, etc.)
- [ ] Line-height matches standard scale (1.4–1.6 for body)
- [ ] Font pairing is limited to two families max
- [ ] No hardcoded sizes or weights in components
- [ ] Rhythmic Consistency: Heading-to-body gaps follow the 8pt grid