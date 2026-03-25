<!-- description: Component standards — loading skeletons, form inputs, interaction rules, and what every component must and must not do. -->

# Frontend — Component Standards

> Components are contracts. Their shape, state, and behavior must be predictable.

---

## Loading states

**UI-10 — Loading Skeletons are Mandatory** `[severity: high]`
Every component that loads async data must have a loading skeleton. A blank space or a spinner alone is not acceptable. The skeleton must match the shape and layout of the loaded content.

```tsx
// correct — skeleton matches loaded content shape
function UserCard({ userId }: { userId: string }) {
  const { data, loading } = useUser(userId);
  if (loading) return <UserCardSkeleton />;
  return <UserCardContent user={data} />;
}

// wrong — spinner doesn't preserve layout
function UserCard({ userId }: { userId: string }) {
  const { data, loading } = useUser(userId);
  if (loading) return <Spinner />;
  return <UserCardContent user={data} />;
}
```

---

## Form inputs

**Floating labels are banned.** Labels always go above the input field. Never inside it, never floating on focus.

```tsx
/* correct */
<div className="field">
  <label htmlFor="email">Email address</label>
  <input id="email" type="email" />
</div>

/* wrong */
<div className="floating-field">
  <input id="email" type="email" placeholder="Email address" />
  <label htmlFor="email">Email address</label>
</div>
```

**Input states that must be styled:**
- Default
- Focus (visible `outline` or `ring`, never removed entirely)
- Error (red border, error message below — not inside — the field)
- Disabled (reduced opacity, `cursor: not-allowed`)

---

## Interaction rules

**Transitions** — opacity and color only. 100–200ms ease.
```css
/* correct */
.button { transition: opacity var(--transition-base), color var(--transition-base); }

/* wrong */
.button { transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1); }
```

**Hover** — no `transform`, no `scale`, no `translateX`. Color and opacity shifts only.

**Focus** — always visible. Never `outline: none` without a replacement. Use `focus-visible` if you need to hide it for pointer users.

---

## Component state checklist

Every interactive component must handle:
- [ ] Default state
- [ ] Hover state
- [ ] Focus state (keyboard accessible)
- [ ] Loading state (if async)
- [ ] Empty/zero state (if data-driven)
- [ ] Error state (if failable)
- [ ] Disabled state (if applicable)

A component that doesn't handle all relevant states is incomplete.

---

## Typing components

All components must be fully typed. No implicit `any`. No untyped props.

```tsx
// correct
interface UserCardProps {
  userId: string;
  onSelect?: (id: string) => void;
}

export function UserCard({ userId, onSelect }: UserCardProps) { ... }

// wrong
export function UserCard({ userId, onSelect }: any) { ... }
```

---

## Component anti-patterns (banned)

- Transform animations on hover (`translateX`, `scale`, `rotate`)
- Bouncy or spring animations
- Animated underlines or morphing input shapes
- Floating labels on form inputs
- Status dots using `::before` pseudo-elements
- Nav badges showing live counts or "Live" status unless genuinely functional
- Donut charts paired with approximate hand-wavy percentages
- Fake charts that exist only to fill space
- Table rows where every status cell has a colored tag badge
- Workspace blocks in sidebar with call-to-action buttons
- Trend indicators with colored text classes
- Quota and usage panels with decorative progress bars
- Footer lines with dashboard meta information