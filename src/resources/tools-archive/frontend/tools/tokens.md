<!-- description: CSS token rules — semantic variable naming, globals.css as source of truth, no magic numbers, theme hierarchy. -->

# Frontend — Token Rules

> All values come from tokens. No exceptions.

---

**UI-1 — Tokens for Everything** `[severity: high]`
All colors, spacing, typography, and shadow values must come from CSS variables defined in `src/app/globals.css`. No hardcoded hex codes. No arbitrary pixel values. No inline styles that bypass the token system.

**UI-2 — globals.css is the Source of Truth** `[severity: high]`
All CSS variable definitions live in `src/app/globals.css`. If a token is missing, add it there. Do not define tokens inside components or page files.

**UI-3 — Semantic Variable Names** `[severity: high]`
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

**UI-4 — Theme Hierarchy** `[severity: medium]`
Styles follow the defined cascade: `:root` → `@theme` → `.utilities`. No duplicate definitions across layers. No overriding a root variable inside a component.

**UI-5 — No Magic Numbers** `[severity: medium]`
Any value with semantic meaning belongs in a token. If it appears more than once, it must be a token. The variable name must make the meaning readable without a comment.

---

## Token anatomy reference

Every token group should follow this pattern in `globals.css`:

```css
:root {
  /* Surface */
  --color-surface-base: #0d1117;
  --color-surface-primary: #161b22;
  --color-surface-elevated: #1c2128;

  /* Text */
  --color-text-primary: #c9d1d9;
  --color-text-muted: #8b949e;
  --color-text-inverse: #0d1117;

  /* Accent */
  --color-accent: #f78166;
  --color-primary: #58a6ff;
  --color-secondary: #79c0ff;

  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-2xl: 48px;
  --spacing-3xl: 64px;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-modal: 16px;

  /* Shadow */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.10);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.10);

  /* Transition */
  --transition-fast: 100ms ease;
  --transition-base: 150ms ease;
  --transition-slow: 200ms ease;
}
```