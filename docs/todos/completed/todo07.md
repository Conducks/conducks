# todo07 — workspace rollout: run conducks on the drifting repos
Status: blocked
- Builds: 0034
- Blocked by: every task targets another repository (subject-d, orchestrator, dual_chatbot, assistant, subject-b, envoy-mail, growth-ops, Said-Foundation, medical_chatbot_2, interview, unnamed-C-level), not this one; still intended, not dropped
- Acceptance: every repo Phase 0 marks ACTIVE has `conducks analyze` run, a `docs/` tree conforming to the conducks-docs standard, and appears in a workspace drift ledger fed by its own conducks output rather than a one-time snapshot.

## Context

This is a rollout, not a build — conducks is the tool and these repos are the load. Nothing here
changes conducks itself, which is why it stays blocked while conducks is under construction.

The done-condition is the same for every repo and is stated once in Acceptance: analyze runs, the
docs tree conforms, the ledger sees it. The per-repo lines below carry the EVIDENCE that the repo has
rotted, not a separate definition of done.

Every task is `[>]`, deferred, for one reason: this session owns conducks and nothing else. They are
owed, they are not owed now, and the board should not count them as tonight's work.

## Phase 0 — triage before documenting anything
- [-] DROPPED 2026-08-01 — Said's call, which is exactly the decision this todo said only he could make: conducks is not being applied to these repositories. The verification surface is subject-b and conducks itself, and nothing else. Original: Decide per repo: ACTIVE, FREEZE or KILL — deferred, Said's call and no agent can make it. Applying the docs standard to a repo that gets killed is the whole cost with none of the value, so this gates both phases below. Target is roughly six ACTIVE, because the point is a mental map small enough to hold
- [-] DROPPED 2026-08-01 — Said's call, which is exactly the decision this todo said only he could make: conducks is not being applied to these repositories. The verification surface is subject-b and conducks itself, and nothing else. Original: Decide what a FROZEN repo gets — deferred with the triage above, same reason. A one-line `README` stating it is frozen and why is probably enough; the full standard is probably not

## Phase 1 — highest-rot ACTIVE repos first
- Depends: todo07#P0
- [-] DROPPED 2026-08-01 — Said's call, which is exactly the decision this todo said only he could make: conducks is not being applied to these repositories. The verification surface is subject-b and conducks itself, and nothing else. Original: subject-d — 212-file dormant Go agent framework; arch doc 5mo stale against 776 changed files — deferred, other repo
- [-] DROPPED 2026-08-01 — Said's call, which is exactly the decision this todo said only he could make: conducks is not being applied to these repositories. The verification surface is subject-b and conducks itself, and nothing else. Original: orchestrator — 483M legacy dir plus a 230M orphan datahub; docs describe a folder tree that no longer exists — deferred, other repo
- [-] DROPPED 2026-08-01 — Said's call, which is exactly the decision this todo said only he could make: conducks is not being applied to these repositories. The verification surface is subject-b and conducks itself, and nothing else. Original: dual_chatbot — abandoned split-engine refactor left in the tree beside the real engine — deferred, other repo
- [-] DROPPED 2026-08-01 — Said's call, which is exactly the decision this todo said only he could make: conducks is not being applied to these repositories. The verification surface is subject-b and conducks itself, and nothing else. Original: unnamed-C-level — `architecture.md` describes a Turborepo that does not exist, frozen at scaffold day — deferred, other repo

## Phase 2 — the rest of the ACTIVE set
- Depends: todo07#P0
- [-] DROPPED 2026-08-01 — Said's call, which is exactly the decision this todo said only he could make: conducks is not being applied to these repositories. The verification surface is subject-b and conducks itself, and nothing else. Original: assistant — `features.md` documents a subsystem that greps to zero: fresh timestamp, dead content — deferred, other repo
- [-] DROPPED 2026-08-01 — Said's call, which is exactly the decision this todo said only he could make: conducks is not being applied to these repositories. The verification surface is subject-b and conducks itself, and nothing else. Original: subject-b · envoy-mail · growth-ops · Said-Foundation · medical_chatbot_2 · interview — deferred, other repos, and which of these survive Phase 0 is unknown
- [-] DROPPED 2026-08-01 — Said's call, which is exactly the decision this todo said only he could make: conducks is not being applied to these repositories. The verification surface is subject-b and conducks itself, and nothing else. Original: Wire `conducks guard` into each ACTIVE repo's CI so drift cannot re-accumulate — deferred behind `todo22#P1`, not only behind the triage: guard does not run in conducks' own CI today, and a gate that has never gated its own repo has not been shown to gate anything

## Phase 3 — cross-project
- Depends: todo07#P2
- [-] DROPPED 2026-08-01 — Said's call, which is exactly the decision this todo said only he could make: conducks is not being applied to these repositories. The verification surface is subject-b and conducks itself, and nothing else. Original: A workspace-level drift ledger fed by each repo's conducks output, replacing the swarm snapshot — deferred behind the repos that feed it. The snapshot is a photograph and goes stale silently; the ledger is what this todo exists to produce
