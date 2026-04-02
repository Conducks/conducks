<!-- description: Spacing scale, standard component dimensions, mobile-first rules, container widths, and layout anti-patterns. -->

# Frontend — Layout Rules

> Spacing is a system, not a feeling. Layout is a decision, not a default.

---

**UI-6 — Spacing Scale** `[severity: medium]`
All spacing is multiples of 4px. Prefer 8pt increments for layout (8, 16, 24, 32, 48, 64). Never use arbitrary values like `13px`, `22px`, or `37px`.

**UI-7 — Standard Component Dimensions**

| Component | Rule |
|---|---|
| Sidebar | 240–260px fixed width, solid background, simple `border-right` |
| Toolbar | 48–56px height, simple horizontal layout |
| Body text | 14–16px, consistent line-height (1.5–1.6) |
| Icons | 16–20px, monochrome or subtle color, no decorative backgrounds |
| Border radius | 8–12px max for cards and containers, 6–8px for buttons, 16px max for modals |
| Shadows | `0 2px 8px rgba(0,0,0,0.10)` max — no dramatic or colored shadows |
| Transitions | 100–200ms ease — opacity and color only |
| Max container | 1200–1400px centered with standard padding |
| Standard padding | 20–30px — never 48–64px |

**UI-8 — Mobile First** `[severity: high]`
Build for the smallest viewport first. Add breakpoints upward. Never build desktop-first and patch mobile afterward.

---

## Layout rules in practice

**Container pattern**
```css
.container {
  width: 100%;
  max-width: 1280px;
  margin-inline: auto;
  padding-inline: var(--spacing-lg); /* 24px */
}
```

**Grid over flex for page layout**
Use CSS Grid for page-level structure. Use Flexbox for component-level alignment. Don't use Flexbox to build a 12-column layout.

**Vertical rhythm**
Headings, paragraphs, and components should use consistent vertical spacing from the spacing scale. Never eyeball the gap between two elements.

**Breakpoints**
Define breakpoints in `globals.css` as custom properties or use a fixed set:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px

No breakpoints between these values unless there is a genuine layout reason.

---

## Layout anti-patterns (banned)

- Hero sections inside internal dashboards or app screens
- KPI metric-card grid as the default dashboard opening view
- Right rail panels with "Today" schedule or secondary content
- Sticky left navigation unless the information architecture genuinely requires it
- **Inverted Hierarchy**: Massive icons (48px+) paired with tiny text that feels like an afterthought.
- Overpadded layouts — standard padding is 20–30px, not 48–64px
- Mixed alignment where some content hugs the left and other content floats center
- Dead space created purely to look expensive
- Mobile collapse that stacks everything into one long undifferentiated column
- Multiple nested panel types (`panel`, `panel-2`, `rail-panel`, `table-panel`)

---

## Technical checklist

**UI-9 — Meta-Tag Minimums** `[severity: high]`
Every production page must include:
- [ ] Descriptive HTML `<title>` (not "Home" or "Index")
- [ ] Compelling meta `<description>`
- [ ] OpenGraph (`og:image`) for social sharing
- [ ] Favicon
- [ ] Functional, non-broken responsive layout (no text overflow at 375px)