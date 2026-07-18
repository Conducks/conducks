# Q8 — Merge Jest Configs (Wave 5, Agent 02)

**Date:** 2026-06-21
**Task:** Merge `jest.config.js` and `jest.persistence.config.cjs` into a single unified config.

## Problem

Two Jest configs existed with divergent settings:
- `jest.config.js`: ESM preset, `@/` alias, full ts-jest ESM transform, unit/integration tests
- `jest.persistence.config.cjs`: CJS module format, missing `@/` alias, `useESM: false`, only matched `tests/persistence/**`

The persistence config was missing the `@/` moduleNameMapper entry, meaning any persistence test using `@/` imports would fail at resolve time.

## Fix Applied

### 1. Merged into `jest.config.js` using Jest `projects` array

- Shared `moduleNameMapper` constant includes both `^@/(.*)\\.js$` and relative `.js` strip rules — applied to both projects.
- `unit` project: ESM preset + `useESM: true`, matches all `tests/**/*.test.ts` excluding `tests/legacy/archived-tests/` and `tests/persistence/` (explicit exclusion to avoid overlap).
- `persistence` project: same ESM preset + `useESM: true` (upgraded from `useESM: false` — the old setting was inconsistent with the ESM project setup), matches `tests/persistence/**/*.test.ts`.

### 2. Updated `package.json`

`test:persistence` changed from:
```
jest --config jest.persistence.config.cjs
```
to:
```
cross-env NODE_OPTIONS=--experimental-vm-modules jest --selectProjects persistence
```
Consistent with other test scripts; uses `displayName: 'persistence'` to select the right project.

### 3. Deleted `jest.persistence.config.cjs`

File removed.

## Verification

`npx tsc --noEmit` — clean, no errors.

## Files Changed

- `jest.config.js` — rewritten to use `projects` array
- `package.json` — `test:persistence` script updated
- `jest.persistence.config.cjs` — deleted
