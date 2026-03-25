<!-- description: Complete hard-banned patterns list — visual decoration, layout, typography, copy, and specific markup that is never allowed. -->

# Frontend — Hard Banned Patterns

> These are never acceptable. If you find yourself doing any of these, stop and rethink.

---

## Visual decoration

- Glassmorphism, frosted panels, blur haze, or conic-gradient decorations
- Soft corporate gradients used to fake premium feel
- Colored or dramatic shadows (`box-shadow` over `0 2px 8px`)
- **The Signature Purple Problem**: Random purple gradients, neon shadows, purple hover fills, or purple-on-purple accents used as a substitute for visual hierarchy.
- **Icon & Emoji Purgatory**: Using icons or emojis for decoration rather than utility. Icons are for interactive actions; emojis are for personality. Neither should be used as feature bullet points or hero "flavor".
- **Hero Badges & Eyebrows**: Labels like "Protocol-Driven Governance" or "Capabilities" floating above headlines. These are lazy AI-startup tropes that fail the "Industrial Professionalism" test.
- **Sparkle Overload**: Using `✨` or sparkle icons in hero text, buttons, or pricing cards for "vibe" decoration.
- Glows on cards or UI elements instead of hierarchy
- Radial gradients in backgrounds
- Gradient fills on progress bars or pipeline indicators
- Gradient backgrounds on brand marks or avatars
- Rounded corners above 12px on anything except modals (16px max)
- Pill shapes on anything that is not a tag or badge
- Decorative sidebar blobs or floating detached sidebar shells

---

## Layout and structure

- Hero sections inside internal dashboards or app screens
- KPI metric-card grid as the default dashboard opening
- Right rail panels with "Today" schedule or secondary content
- Sticky left navigation unless the information architecture genuinely requires it
- Overpadded layouts — standard padding is 20–30px, not 48–64px
- Mixed alignment where some content hugs the left and other content floats center
- Dead space created purely to look expensive
- Mobile collapse that stacks everything into one long undifferentiated column
- Multiple nested panel types (`panel`, `panel-2`, `rail-panel`, `table-panel`)

---

## Typography and copy

- Eyebrow labels: `<small>` or `span` labels with uppercase and letter-spacing (e.g., "CAPABILITIES"). These are banned.
- Decorative headlines inside app screens.
- Section notes that explain what the UI does in marketing language.
- Mixed serif and sans-serif as a shortcut to "premium".
- Muted gray-blue text that reduces contrast and clarity.
- Generic startup copy anywhere in the interface.

---

## Components

- **Emoji Overload**: Using emojis as icons, in headings, or as bullet points in pricing tables. Emojis are for personality; icons are for utility.
- Transform animations on hover (`translateX`, `scale`, `rotate`)
- Bouncy or spring animations — transitions are `opacity` and `color` only
- Animated underlines or morphing input shapes
- Floating labels on form inputs
- Status dots using `::before` pseudo-elements
- Nav badges showing live counts or "Live" status unless genuinely functional
- Donut charts paired with approximate hand-wavy percentages
- Fake charts that exist only to fill space
- Table rows where every status cell has a colored tag badge
- Workspace blocks in sidebar with call-to-action buttons
- Trend indicators (`trend-up`, `trend-down`) with colored text classes
- Quota and usage panels with decorative progress bars
- Footer lines with dashboard meta information

---

## Specifically banned markup

This markup is banned in all forms, in every file, in every context:

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

---

## The test

Before committing any UI code, ask: _would a designer at Linear, Raycast, Stripe, or GitHub make this choice?_

If the honest answer is no, do not do it.