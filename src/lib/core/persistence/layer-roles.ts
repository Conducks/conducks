import { UNCOMMITTED_LAYER, layerIdForCommit } from "@/lib/core/persistence/layer-reachability.js";

/**
 * Conducks — the three layer ROLES, and what they resolve to (ADR 0035, todo20#P3).
 *
 * ADR 0035 named these deliberately. `main`/`branch`/`uncommitted` was the first draft and it is
 * wrong, because it privileges `main` — which is the wrong baseline for anyone branching off
 * `develop` or stacking branches. The roles are relative to where you are standing:
 *
 *   uncommitted   the working tree and index. The ONE mutable layer, and the only one that can be
 *                 wrong. Lives in `nodes`, rewritten by every pulse.
 *   current       the commit HEAD points at. Immutable, so it never needs invalidating.
 *   target        what this branch would merge INTO — the upstream tracking ref, falling back to
 *                 the merge-base fork point. Resolved per branch, never assumed.
 *
 * A role is not a layer id. This is the function that turns one into the other, and it is separate
 * from both git and the vault so the resolution rule can be asserted directly — the part with the
 * interesting failures is what happens when git cannot answer.
 */
export type LayerRole = 'uncommitted' | 'current' | 'target';

/** What a role resolution needs from git. Narrow on purpose — it is the whole git surface used here. */
export interface LayerGitFacts {
  /** HEAD's commit, or null outside a repository. */
  headCommit: string | null;
  /** The fork point this branch would merge into, or null when it cannot be resolved. */
  targetCommit: string | null;
}

/**
 * The layer id a role names, or NULL when it cannot be resolved.
 *
 * **Null is never a fallback to another layer**, and that is ADR 0035's rule rather than a
 * defensive habit: "there is no fallback when the target cannot be resolved — the command says so
 * and refuses". Answering `current` when someone asked for `target` produces a diff against the
 * wrong baseline, which is the failure this project keeps shipping and the one thing worse than no
 * answer. A caller that gets null tells the user which role failed.
 *
 * `uncommitted` is the exception and always resolves: it is the working tree, which exists even
 * with no git at all. A project with no repository can still be analyzed and read — ADR 0035
 * protects that case explicitly — so a null `headCommit` must not make the graph unreadable.
 */
export function resolveLayerRole(role: LayerRole, git: LayerGitFacts): string | null {
  switch (role) {
    case 'uncommitted':
      return UNCOMMITTED_LAYER;
    case 'current':
      return git.headCommit ? layerIdForCommit(git.headCommit) : null;
    case 'target':
      return git.targetCommit ? layerIdForCommit(git.targetCommit) : null;
  }
}

/**
 * Why a role could not be resolved, in words a caller can print.
 *
 * Separate from `resolveLayerRole` so the refusal message is written once rather than at each call
 * site — the same reason `branchRefusalMessage` is its own function. A message that only says
 * "could not resolve" sends the reader nowhere; naming the cause tells them whether to commit, to
 * set an upstream, or that they are on a detached HEAD.
 */
export function layerRoleRefusal(role: LayerRole, git: LayerGitFacts): string | null {
  if (resolveLayerRole(role, git)) return null;
  if (role === 'current') {
    return '🛡️ [Conducks] No commit to read `current` from — HEAD resolves to nothing. A repository with no commits yet has no `current` layer; use `uncommitted`.';
  }
  return '🛡️ [Conducks] Could not resolve this branch\'s merge target, so there is no `target` layer to read. Set an upstream (`git branch --set-upstream-to=...`) or name the baseline explicitly — conducks will not guess `main`, because a diff against the wrong baseline is worse than no diff.';
}
