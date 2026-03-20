<!-- @format -->

# UI Guidance

> Every value comes from a token. Every visual decision has a reason.
> If a UI choice feels like the default AI move — it is wrong. Pick the harder, cleaner option.

---

## The standard

Build UI that feels like it was designed by a human who cares about function over impression.
Reference points: Linear, Raycast, Stripe, GitHub.
They do not try to grab attention. They just work.

Before writing any UI code, ask: _would a designer at one of those companies make this choice?_
If the honest answer is no, do not do it.

---

## Token rules

**UI-1 — Tokens for everything** `[severity: high]`
All colors, spacing, typography, and shadow values must come from CSS variables defined in `src/app/globals.css`. No hardcoded hex codes. No arbitrary pixel values. No inline styles that bypass the token system.

**UI-2 — Globals is the source of truth** `[severity: high]`
All CSS variable definitions live in `src/app/globals.css`. If a token is missing, add it there. Do not define tokens inside components or page files.

**UI-3 — Semantic variable names** `[severity: high]`
Variables describe purpose, not appearance.

```css
/* correct */
--color-surface-primary
--color-text-muted
--color-accent
--spacing-component-gap

/* wrong */
--blue-500
--dark-gray
--24px
```

**UI-4 — Theme hierarchy** `[severity: medium]`
Styles follow the defined cascade: `:root` → `@theme` → `.utilities`. No duplicate definitions across layers. No overriding a root variable inside a component.

**UI-5 — No magic numbers** `[severity: medium]`
Any value with semantic meaning belongs in a token. If it appears more than once, it must be a token. The variable name must make the meaning readable without a comment.

---

## Spacing and layout

**UI-6 — Spacing scale** `[severity: medium]`
All spacing is multiples of 4px. Prefer 8pt increments for layout (8, 16, 24, 32, 48, 64). Never use arbitrary values like `13px`, `22px`, or `37px`.

**UI-7 — Standard component dimensions**

| Component     | Rule                                                              |
| ------------- | ----------------------------------------------------------------- |
| Sidebar       | 240–260px fixed width, solid background, simple `border-right`    |
| Toolbar       | 48–56px height, simple horizontal layout                          |
| Body text     | 14–16px, consistent line-height                                   |
| Icons         | 16–20px, monochrome or subtle color, no decorative backgrounds    |
| Border radius | 8–12px max for cards and containers, 6–8px for buttons            |
| Shadows       | `0 2px 8px rgba(0,0,0,0.10)` max — no dramatic or colored shadows |
| Transitions   | 100–200ms ease — opacity and color only                           |
| Max container | 1200–1400px centered with standard padding                        |

**UI-8 — Mobile first** `[severity: high]`
Build for the smallest viewport first. Add breakpoints upward. Never build desktop-first and patch mobile afterward.

---

## Color

**UI-9 — Color priority order** `[severity: high]`

1. Use the existing colors from the project if they are defined in `globals.css` or a design file
2. If no palette exists, pick one from the approved palettes below
3. Never invent a random color combination

Colors must stay calm. They should not compete with content. Dark muted tones over blue-heavy schemes.

**Approved dark palettes**

| Name            | Background | Surface   | Primary   | Secondary | Accent    | Text      |
| --------------- | ---------- | --------- | --------- | --------- | --------- | --------- |
| Void Space      | `#0d1117`  | `#161b22` | `#58a6ff` | `#79c0ff` | `#f78166` | `#c9d1d9` |
| Slate Noir      | `#0f172a`  | `#1e293b` | `#38bdf8` | `#818cf8` | `#fb923c` | `#f1f5f9` |
| Charcoal Studio | `#1c1c1e`  | `#2c2c2e` | `#0a84ff` | `#5e5ce6` | `#ff375f` | `#f2f2f7` |
| Graphite Pro    | `#18181b`  | `#27272a` | `#a855f7` | `#ec4899` | `#14b8a6` | `#fafafa` |
| Obsidian Depth  | `#0f0f0f`  | `#1a1a1a` | `#00d4aa` | `#00a3cc` | `#ff6b9d` | `#f5f5f5` |
| Carbon Elegance | `#121212`  | `#1e1e1e` | `#bb86fc` | `#03dac6` | `#cf6679` | `#e1e1e1` |
| Twilight Mist   | `#1a1625`  | `#2d2438` | `#9d7cd8` | `#7aa2f7` | `#ff9e64` | `#dcd7e8` |
| Deep Ocean      | `#001e3c`  | `#0a2744` | `#4fc3f7` | `#29b6f6` | `#ffa726` | `#eceff1` |

**Approved light palettes**

| Name            | Background | Surface   | Primary   | Secondary | Accent    | Text      |
| --------------- | ---------- | --------- | --------- | --------- | --------- | --------- |
| Alabaster Pure  | `#fcfcfc`  | `#ffffff` | `#1d4ed8` | `#2563eb` | `#dc2626` | `#1e293b` |
| Ivory Studio    | `#f5f5f4`  | `#fafaf9` | `#0891b2` | `#06b6d4` | `#f59e0b` | `#1c1917` |
| Porcelain Clean | `#f9fafb`  | `#ffffff` | `#4f46e5` | `#8b5cf6` | `#ec4899` | `#111827` |
| Frost Bright    | `#f1f5f9`  | `#f8fafc` | `#0f766e` | `#14b8a6` | `#e11d48` | `#0f172a` |
| Sand Warm       | `#faf8f5`  | `#ffffff` | `#b45309` | `#d97706` | `#059669` | `#451a03` |
| Arctic Breeze   | `#f0f9ff`  | `#f8fafc` | `#0284c7` | `#0ea5e9` | `#f43f5e` | `#0c4a6e` |
| Pearl Minimal   | `#f8f9fa`  | `#ffffff` | `#0066cc` | `#6610f2` | `#ff6b35` | `#212529` |

---

## Loading and states

**UI-10 — Loading skeletons are mandatory** `[severity: high]`
Every component that loads async data must have a loading skeleton. A blank space or a spinner alone is not acceptable. The skeleton must match the shape and layout of the loaded content.

---

## Hard banned patterns

These are never acceptable. If you find yourself doing any of these, stop and rethink.

**Visual decoration**

- Glassmorphism, frosted panels, blur haze, or conic-gradient decorations
- Soft corporate gradients used to fake premium feel
- Colored or dramatic shadows (`box-shadow` over `0 2px 8px`)
- Glows on cards or UI elements instead of hierarchy
- Radial gradients in backgrounds
- Gradient fills on progress bars or pipeline indicators
- Gradient backgrounds on brand marks or avatars
- Rounded corners above 12px on anything except modals (16px max)
- Pill shapes on anything that is not a tag or badge
- Decorative sidebar blobs or floating detached sidebar shells

**Layout and structure**

- Hero sections inside internal dashboards or app screens
- KPI metric-card grid as the default dashboard opening
- Right rail panels with "Today" schedule or secondary content
- Sticky left navigation unless the information architecture genuinely requires it
- Overpadded layouts — standard padding is 20–30px, not 48–64px
- Mixed alignment where some content hugs the left and other content floats center
- Dead space created purely to look expensive
- Mobile collapse that stacks everything into one long undifferentiated column
- Multiple nested panel types (`panel`, `panel-2`, `rail-panel`, `table-panel`)

**Typography and copy**

- Eyebrow labels: `<small>MARCH SNAPSHOT</small>` with uppercase and letter-spacing
- Decorative headlines inside app screens: _"Operational clarity without the clutter"_
- Section notes and mini-notes that explain what the UI does in marketing language
- Mixed serif and sans-serif as a shortcut to "premium"
- Muted gray-blue text that reduces contrast and clarity
- Uppercase labels with letter-spacing used decoratively
- Generic startup copy anywhere in the interface

**Components**

- Transform animations on hover (`translateX`, `scale`, `rotate`)
- Bouncy or spring animations — transitions are `opacity` and `color` only
- Animated underlines or morphing input shapes
- Floating labels on form inputs — labels go above the field, always
- Status dots using `::before` pseudo-elements
- Nav badges showing live counts or "Live" status unless genuinely functional
- Donut charts paired with approximate hand-wavy percentages
- Fake charts that exist only to fill space
- Table rows where every status cell has a colored tag badge
- Workspace blocks in sidebar with call-to-action buttons
- Trend indicators (`trend-up`, `trend-down`) with colored text classes
- Quota and usage panels with decorative progress bars
- Footer lines with dashboard meta information

**This markup is specifically banned in all forms:**

```html
<!-- banned: eyebrow + headline block -->
<div class="headline">
	<small>Team Command</small>
	<h2>One place to track what matters today.</h2>
	<p>The layout stays strict and readable...</p>
</div>

<!-- banned: decorative note card -->
<div class="team-note">
	<small>Focus</small>
	<strong>Keep updates brief, blockers visible...</strong>
</div>
```

No `<small>` as a label. No decorative `<strong>` blocks. No rounded `<span>` pills used as labels.
