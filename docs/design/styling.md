# Conducks Styling Guide

High-fidelity source of truth for all visual and interactive design standards in the Conducks Mirror dashboard and any Conducks-branded surfaces.

---

## Design Tokens

### 1. Radii (Corner Smoothness)
- `--radius-node`: `50%` (Circular graph nodes — structural bubbles)
- `--radius-panel`: `12px` (Sidebar panels and info cards)
- `--radius-badge`: `4px` (Layer rank badges, kind labels)
- `--radius-btn`: `6px` (Command sidebar buttons)

### 2. Spacing Scale
- `--space-xs`: `4px` (Icon padding, tight groupings)
- `--space-sm`: `8px` (Within-component spacing)
- `--space-md`: `16px` (Between components)
- `--space-lg`: `24px` (Section separation)
- `--space-xl`: `48px` (Major layout divisions)

### 3. Dark Terminal Palette
- `--bg-void`: `#0a0a0f` (Base surface — the canvas)
- `--bg-panel`: `#0f0f18` (Sidebar and overlay panels)
- `--bg-elevated`: `#1a1a2e` (Cards, hover surfaces)
- `--border-subtle`: `rgba(255,255,255,0.07)` (Panel borders)
- `--ink`: `#e8e8f0` (Primary text)
- `--ink-muted`: `#888899` (Secondary labels, meta text)
- `--ink-faint`: `rgba(232,232,240,0.3)` (Watermarks, disabled)

### 4. Structural Layer Colors (9-Layer Taxonomy)
- `--layer-ecosystem`: `#9b59b6` (L0 — purple, root anchor)
- `--layer-repository`: `#8e44ad` (L1 — deep purple)
- `--layer-namespace`: `#3498db` (L2 — blue, folders)
- `--layer-unit`: `#2ecc71` (L3 — green, files)
- `--layer-infra`: `#e67e22` (L4 — orange, routes/middleware)
- `--layer-structure`: `#e74c3c` (L5 — red, classes)
- `--layer-behavior`: `#f39c12` (L6 — amber, functions)
- `--layer-atom`: `#1abc9c` (L7 — teal, variables)
- `--layer-data`: `#95a5a6` (L8 — grey, types/schemas)

### 5. Risk Heat Colors
- `--risk-low`: `#2ecc71` (0.0–0.3)
- `--risk-medium`: `#f39c12` (0.3–0.6)
- `--risk-high`: `#e74c3c` (0.6–0.8)
- `--risk-critical`: `#c0392b` (0.8–1.0, pulsing glow)

### 6. Photon Path Colors
- `--photon-active`: `#00d4ff` (Active trace / selected connection)
- `--photon-dim`: `rgba(255,255,255,0.05)` (Everything not on the active path)

---

## Typography Scale

| Class | Usage | Spec |
|:---|:---|:---|
| `.node-label` | Symbol names in the graph | `10–13px`, `font-mono`, fade on zoom-out |
| `.sidebar-heading` | Panel section titles | `11px`, `uppercase`, `tracking-[0.15em]`, `--ink-muted` |
| `.sidebar-value` | Metric values, scores | `14px`, `font-mono`, `--ink` |
| `.risk-score` | 6-signal risk decomposition numbers | `18px`, `font-mono`, bold, risk-heat colored |
| `.layer-badge` | Canonical kind labels (BEHAVIOR, STRUCTURE) | `9px`, `uppercase`, `tracking-[0.12em]`, `--bg-elevated` bg |
| `.tooltip-title` | Node name in hover tooltip | `13px`, semibold, `--ink` |
| `.tooltip-meta` | File path, line numbers | `11px`, `--ink-muted`, `font-mono` |

**Font stack:** `'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace` for all code and metric text. System sans-serif (`ui-sans-serif, system-ui`) for UI labels only.

---

## Icon Infrastructure

- **Library:** Inline SVG — no external icon library dependency.
- **Stroke weight:** `1.5px` for UI icons, `1px` for graph edge arrows.
- **Scale:**
  - `sm`: `12px` (Inline with text)
  - `md`: `16px` (Action buttons)
  - `lg`: `20px` (Panel icons)
  - `xl`: `24px` (Primary sidebar controls)
- **Structural motifs:** Layer indicator icons at `opacity-[0.04]` as background watermarks in section headers.

---

## Graph Node Affordance

### 1. Node Sizing
- Node radius scales with `sqrt(gravity)` — high-gravity symbols are visibly larger.
- Minimum radius: `4px`. Maximum radius: `32px`.
- Entry points receive `+4px` radius bonus regardless of gravity.

### 2. Node States
- **Default:** Layer color at `opacity-0.85`, thin `1px` ring.
- **Hover:** Scale `1.15`, glow matching layer color at `blur-8px`.
- **Selected:** Scale `1.2`, bright ring `2px`, sidebar populates with 6-signal breakdown.
- **On active Photon path:** Full opacity, pulsing glow. All others dim to `var(--photon-dim)`.

### 3. Edge Rendering
- `CALLS`: solid line, `1.5px`, `opacity-0.6`
- `IMPORTS`: dashed line, `1px`, `opacity-0.4`
- `EXTENDS/IMPLEMENTS`: solid line, `2px`, `opacity-0.7`
- `PULSES_TO`: animated dash, `1px`, teal
- Active (Photon): `var(--photon-active)`, `2px`, animated glow

---

## Command Sidebar

- Width: `280px` (fixed, collapsible)
- Background: `var(--bg-panel)` with `backdrop-blur-md`
- Sections: Namespace Search, Layer Toggles, Health Rings, Active Node Detail
- Toggle buttons use `--radius-btn`, `--space-sm` padding, `font-semibold`
- Avoid `uppercase tracking-widest` on interactive buttons — reserve for static section labels
- Active state: `--layer-{kind}` background at `opacity-0.15`, matching border

---

## Layout Rules

- Mirror canvas fills viewport; sidebar overlays on the right.
- Namespace clusters maintain `structuralSpread` spacing (minimum `2x` node diameter).
- Labels fade in progressively: namespace labels always visible, file labels at zoom ≥ 0.6, symbol labels at zoom ≥ 1.2.
- No overlapping clusters — force simulation must resolve within 300ms on 3,500 nodes.
- **Responsive sizing uses `ResizeObserver`, not `window.resize`.** Watch the container element directly — grab `contentRect.width` from the first entry and redraw on every size change. `window.resize` misses layout shifts from sidebars, flex containers, and panel resizes. Required for any chart, graph, or canvas that must fill its container.
