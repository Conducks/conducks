<!-- description: Frontend and UI governance. Token rules, layout, color, component standards, and a complete banned-patterns list. Call with tool= to get a specific guide. -->

# Frontend Guidance — Index

> Every value comes from a token. Every visual decision has a reason.
> If a UI choice feels like the default AI move — it is wrong. Pick the harder, cleaner option.

Build UI that feels like it was designed by a human who cares about function over impression.
Reference points: Linear, Raycast, Stripe, GitHub. They do not try to grab attention. They just work.

Before writing any UI code, ask: _would a designer at one of those companies make this choice?_
If the honest answer is no, do not do it.

---

## Available sub-tools

| tool= | What it covers |
|---|---|
| `tokens` | CSS variable rules, semantic naming, theme hierarchy, no magic numbers |
| `layout` | Spacing scale, component dimensions, mobile-first, max widths |
| `color` | Color priority order, approved dark and light palettes |
| `components` | Loading states, interaction rules, form standards |
| `banned` | Complete list of hard-banned patterns — visual, layout, typography, component |
| `i18n` | Internationalization Protocol — mandatory keys, routing models, no hardcoded strings |

---

## The standard (always applies)

- All colors, spacing, typography come from CSS variables in `globals.css`
- No hardcoded hex codes. No arbitrary pixel values. No inline styles
- Spacing is multiples of 4px. Prefer 8pt increments for layout
- Border radius: 8–12px max for cards, 6–8px for buttons, 16px absolute max for modals
- Transitions: 100–200ms ease — opacity and color only. Nothing else moves
- Shadows: `0 2px 8px rgba(0,0,0,0.10)` max — no dramatic or colored shadows