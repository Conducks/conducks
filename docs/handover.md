# Handover — 2026-08-01
Status: current

## Where it stands
Gates green: 1,176 tests / 146 suites, typecheck, `docs-lint` (94 docs), `audit` clean.
Vault on its own source: 4,686 nodes, 16,157 edges, density 3.45 — 226 dangling targets of 16,127 (1.40%).
Vault on mentorseed (five services, the large subject): 20,092 edges, 477 dangling (2.37%), down from 695 today.
Every ADR carries a build link or an `- Enforced by:`. Latest are 0082 (a declared type is read, a returned one is not guessed) and 0083 (the vault loads materialised, not streamed).
**Never released** — `doctor` reports 0.7.7, no release published. `todo16` is deliberately left to a human: publishing spends a name once.

## What changed since the last handover
The board went from 146 open tasks to **zero**. What remains is three deferred tasks, each with a named blocker, and none of them is work I can do alone.
Two shapes account for most of the closure: tasks recorded as blocked whose blocker had become false and nobody re-checked, and tasks already done whose record was never stamped. Re-testing a stated blocker before believing it is the single highest-yield move in this repo.
Layers landed (`todo20`) — committed graphs are stored content-addressed beside the hot path, and `load()` is the one place that knows, so all ~30 read commands became layer-aware in one change.
Next.js routes landed: 0 route nodes to 138 on mentorseed. Declared-type member resolution landed: 218 dangling edges resolved.

## What is deferred, and why
1. `todo29` — the factory half of member resolution (`db.query`, 281 edges on mentorseed). Needs a real type checker; guessing a factory's return type is the inference ADR 0070 refuses.
2. `todo16` — npm publish. Two steps left to a human by decision.
3. `todo09#P3` — the vulnerability surface. Needs an advisory database this environment cannot reach.

## Next, in order
1. **Accuracy testing against ground truth.** Every number in this file measures CHANGE, not correctness — on this repo and on mentorseed nobody knows the true answer, so a right and a wrong answer look identical. The agreed plan is a ~40-file controlled TypeScript fixture with deliberately planted hard shapes (factory, barrel, `export *`, shadowed names, dynamic dispatch, exported dead code, cycles), ground truth written BEFORE anything is run, scoring the core 12 commands on accuracy, truthfulness, reliability and speed.
2. Anything that testing turns up. Expect it to; the traps are chosen from shapes already known to be hard.
3. Release, once there is a correctness number to release against.

## The one process rule this session earned
Write the expected answer down before running the command. Twice this session I read an output first and rationalised it — a count that improved while the rate worsened (a denominator being destroyed), and a full SHA reproduced from memory that was wrong in the middle. Both were caught by measurement, not by rereading.
