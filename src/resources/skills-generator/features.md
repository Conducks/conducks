<!-- description: Product features and specifications template. Every service must have a features.md following this exact structure and rules. -->

# Features Guidance

> Every service must have a `features.md` file that serves as the source of truth for all architectural and product features. Read this file before making any changes.

---

## Documentation Rules

**FEATURES-1 — Structural Integrity** `[severity: critical]`
This file is the source of truth for all architectural and product features. No capability exists unless it's documented here.

**FEATURES-2 — Title Headers** `[severity: high]`
Every module must have a clear title using Markdown Header Level 2 (##). Separate Core/ and Product/ modules with --- dividers.

**FEATURES-3 — Detailed Bullets** `[severity: high]`
Every bullet point is a unique capability described in plain text. Each bullet must be a complete, specific capability statement.

**FEATURES-4 — Token-Efficient** `[severity: medium]`
No bold, italics, or inline code formatting within the bullet points. Use plain text only.

**FEATURES-5 — Sync Requirement** `[severity: critical]`
This document must be updated immediately upon any change to the codebase. No feature exists until it's documented here.

---

## Template Structure

```
# Product Features & Specifications
*Last Updated: YYYY-MM-DD*

## Documentation Rules
- Rule descriptions...

---

## Core/Module-Name
- Specific capability description in plain text
- Another specific capability
- Detailed feature explanation

## Product/Module-Name
- Business logic capability
- User-facing feature description
- Integration capability details
```

---

## File Location

- **Single Application**: `docs/features.md` (project root)
- **Multi-Service**: `service/docs/features.md` (directly in each service's docs directory)

## When to Update

- **Immediately** when adding new features or capabilities
- **Immediately** when modifying existing functionality
- **Immediately** when removing deprecated features
- **Before** starting any development work (read this file first)

## Validation Checklist

- [ ] Every module has a clear ## header
- [ ] Every bullet is a unique, specific capability
- [ ] No formatting within bullet points
- [ ] All current codebase features are documented
- [ ] Last updated date is current
- [ ] File serves as complete source of truth