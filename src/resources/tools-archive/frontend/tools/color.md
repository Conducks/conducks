<!-- description: Color priority rules and approved dark/light palettes. Use existing project colors first, then pick from this list. Never invent combinations. -->

# Frontend — Color Rules

> Colors must stay calm. They should not compete with content. Dark muted tones over blue-heavy schemes.

---

**UI-9 — Color Selection & Flexibility** `[severity: high]`

1. Priority: Use the existing colors from the project if they align with the brand.
2. Recommendation: If no palette exists, choose from the approved palettes below. 
3. User Consent: These palettes are guidance, not a mandate. Always ask the user if they have a preferred brand palette or if they want to deviate from the suggestions.
4. Constraint: Never invent a random color combination without user approval.

---

## Approved dark palettes

| Name | Background | Surface | Primary | Secondary | Accent | Text |
|---|---|---|---|---|---|---|
| Void Space | `#0d1117` | `#161b22` | `#58a6ff` | `#79c0ff` | `#f78166` | `#c9d1d9` |
| Slate Noir | `#0f172a` | `#1e293b` | `#38bdf8` | `#818cf8` | `#fb923c` | `#f1f5f9` |
| Charcoal Studio | `#1c1c1e` | `#2c2c2e` | `#0a84ff` | `#5e5ce6` | `#ff375f` | `#f2f2f7` |
| Graphite Pro | `#18181b` | `#27272a` | `#a855f7` | `#ec4899` | `#14b8a6` | `#fafafa` |
| Obsidian Depth | `#0f0f0f` | `#1a1a1a` | `#00d4aa` | `#00a3cc` | `#ff6b9d` | `#f5f5f5` |
| Carbon Elegance | `#121212` | `#1e1e1e` | `#bb86fc` | `#03dac6` | `#cf6679` | `#e1e1e1` |
| Twilight Mist | `#1a1625` | `#2d2438` | `#9d7cd8` | `#7aa2f7` | `#ff9e64` | `#dcd7e8` |
| Deep Ocean | `#001e3c` | `#0a2744` | `#4fc3f7` | `#29b6f6` | `#ffa726` | `#eceff1` |

## Approved light palettes

| Name | Background | Surface | Primary | Secondary | Accent | Text |
|---|---|---|---|---|---|---|
| Alabaster Pure | `#fcfcfc` | `#ffffff` | `#1d4ed8` | `#2563eb` | `#dc2626` | `#1e293b` |
| Ivory Studio | `#f5f5f4` | `#fafaf9` | `#0891b2` | `#06b6d4` | `#f59e0b` | `#1c1917` |
| Porcelain Clean | `#f9fafb` | `#ffffff` | `#4f46e5` | `#8b5cf6` | `#ec4899` | `#111827` |
| Frost Bright | `#f1f5f9` | `#f8fafc` | `#0f766e` | `#14b8a6` | `#e11d48` | `#0f172a` |
| Sand Warm | `#faf8f5` | `#ffffff` | `#b45309` | `#d97706` | `#059669` | `#451a03` |
| Arctic Breeze | `#f0f9ff` | `#f8fafc` | `#0284c7` | `#0ea5e9` | `#f43f5e` | `#0c4a6e` |
| Pearl Minimal | `#f8f9fa` | `#ffffff` | `#0066cc` | `#6610f2` | `#ff6b35` | `#212529` |

---

## How to apply a palette

Once a palette is chosen, map it to semantic tokens in `globals.css`. Never reference the raw hex in components — only reference the token:

```css
:root {
  /* Example: Void Space palette applied to tokens */
  --color-surface-base: #0d1117;
  --color-surface-primary: #161b22;
  --color-primary: #58a6ff;
  --color-secondary: #79c0ff;
  --color-accent: #f78166;
  --color-text-primary: #c9d1d9;
}
```

Components use `var(--color-primary)`, not `#58a6ff`. Swapping palettes means changing `globals.css` only — no component changes.

---

## Color anti-patterns (banned)

- Glassmorphism, frosted panels, blur haze, or conic-gradient decorations
- Soft corporate gradients used to fake premium feel
- Colored or dramatic shadows
- Glows on cards or UI elements
- Radial gradients in backgrounds
- Gradient fills on progress bars or pipeline indicators
- Gradient backgrounds on brand marks or avatars
- Muted gray-blue text that reduces contrast and clarity