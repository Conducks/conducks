<!-- description: Visual and interactive design standards. Defines design tokens, typography, icons, and interaction rules. -->

# Styling Guidance

> The `styling.md` file is the high-fidelity source of truth for all visual and interactive design standards. It ensures consistency across the application and prevents design drift.

---

## Documentation Rules

**STYLING-1 — Token Authority** `[severity: critical]`
Design tokens (colors, spacing, radii) defined in this file are non-negotiable. Code implementations must use these tokens rather than ad-hoc values.

**STYLING-2 — Interactive Affordance** `[severity: high]`
Every interactive element must have defined states (hover, active, focus) documented here to ensure a tactile and responsive feel.

**STYLING-3 — Typography Hierarchy** `[severity: high]`
The typography scale must be followed strictly. No custom font sizes or weights should be used outside the defined scale without updating this document.

**STYLING-4 — Icon Standardization** `[severity: medium]`
All icons must follow the defined stroke weights and scale categories to maintain visual balance.

---

## Template Structure

```markdown
# [Project Name] Styling Guide

## 📐 Design Tokens

### 1. Radii (Corner Smoothness)
- `--radius-name`: [value] ([description])

### 2. Heights (Vertical Affinity)
- `var(--h-name)`: [value] ([usage])

### 3. Color Palette
- `token-name`: `hex-code` ([usage context])

---

## ✍️ Typography Scale

| Class | Usage | Technical Spec |
| :--- | :--- | :--- |
| `.class-name` | [usage] | [font, size, leading, tracking] |

---

## 💠 Icon Infrastructure

- **Component**: [Library or wrapper component]
- **Stroke Weights**: [e.g., 2px]
- **Scale**: [sm, md, lg, xl with pixel/rem values]
- **Motifs**: [Specific icon styles or watermarks]

---

## 🔘 Button Affordance & Interaction

### 1. Tactile Feedback
- **Hover**: [Transform/Elevation rules]
- **Active / Press**: [Compression rules]

### 2. Animations
- [Specific micro-interaction rules]

### 3. Visual Clarity
- [Rules for separating labels from actions]
```

---

## File Location

- **Single Application**: `docs/styling.md`
- **Multi-Service**: `service/docs/styling.md` (if service-specific)

## When to Update

- **Immediately** when design tokens are changed or added.
- **Before** implementing a new UI component or module.
- **When** standardizing interactive patterns across the app.

## Validation Checklist

- [ ] All primary colors and background surfaces are tokenized.
- [ ] Typography scale covers all current UI text elements.
- [ ] Hover and Active states are defined for all interactive components.
- [ ] Icon scales and stroke weights are consistent.
- [ ] Layout spacing and radii are clearly defined.
