import { ArchMeasurements } from './arch-detect.js';

/**
 * Conducks — the Architecture Decision Table (todo41#P3) 🏛️
 *
 * Turns ADR 0134's MEASUREMENTS into a NAME — as a table a reader can audit, not a narration. The
 * rules and their thresholds are stated here once; every verdict carries the evidence rows it
 * matched on, because a label without its evidence is the confident-wrong shape this project keeps
 * removing.
 *
 * Three honesty rules, from the todo:
 *   - confidence can be LOW, and is, whenever a signal is missing or weak
 *   - a repository matching nothing gets "no pattern detected, here is the shape" — never the
 *     nearest label
 *   - a codebase matching TWO patterns reports both (mid-migration is a real state, not an error)
 */

export interface ArchVerdict {
  /** e.g. 'hexagonal (ports and adapters)'. */
  pattern: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** The measurement rows this verdict rests on — printable, checkable. */
  evidence: string[];
  /** What would raise the confidence, stated so the reader knows what is missing. */
  caveats: string[];
}

export interface ArchReport {
  verdicts: ArchVerdict[];       // empty = no pattern matched
  /** The raw shape, always printed — the answer that survives a wrong name. */
  shape: string[];
}

export function decide(m: ArchMeasurements): ArchReport {
  const verdicts: ArchVerdict[] = [];
  const driving = m.adapters.filter(a => a.role === 'driving');
  const oneWay = m.bidirectional.length === 0;

  // The raw shape — reported whatever the verdicts say, so a wrong or missing name still leaves
  // the reader holding the measurements.
  const shape = [
    `${driving.length} driving adapter(s)${driving.length ? ': ' + driving.map(a => a.file.split('/').slice(-2).join('/')).join(', ') : ''}`,
    m.compositionRoot
      ? `composition root: ${m.compositionRoot.file} (worst distance ${m.compositionRoot.worstDistance} from ${m.compositionRoot.reachedBy} adapter(s))`
      : 'no shared composition root',
    `${m.layerEdges.length} directory-level dependency edge(s), ${m.bidirectional.length} bidirectional pair(s)` +
      (m.bidirectional.length ? ` — ${m.bidirectional.map(p => `${p.a} <-> ${p.b}`).join('; ')}` : ''),
    `${m.unitCount} file(s) measured`,
  ];

  // ── HEXAGONAL: several doors, one machine, one direction ─────────────────
  if (driving.length >= 2 && m.compositionRoot) {
    const evidence = [
      ...driving.map(a => `door: ${a.file} (${a.reason})`),
      `convergence: every adapter reaches ${m.compositionRoot.file} within ${m.compositionRoot.worstDistance} hop(s)`,
      oneWay ? 'dependencies flow one way at directory level'
             : `${m.bidirectional.length} bidirectional pair(s) — the direction is not clean`,
    ];
    verdicts.push({
      pattern: 'hexagonal (ports and adapters)',
      // Distance-1 convergence is the strong form: every adapter depends on the root DIRECTLY,
      // which is what a composition root is. A longer distance or a dirty direction weakens the
      // claim rather than voiding it.
      confidence: m.compositionRoot.worstDistance === 1 && oneWay ? 'HIGH'
        : oneWay || m.compositionRoot.worstDistance === 1 ? 'MEDIUM' : 'LOW',
      evidence,
      caveats: [
        ...(oneWay ? [] : ['bidirectional directory pairs exist — see the shape section']),
        ...(m.compositionRoot.worstDistance > 1 ? [`convergence is ${m.compositionRoot.worstDistance} hops, not direct`] : []),
      ],
    });
  }

  // ── PLUGIN / MULTI-SERVICE: several doors that share nothing ─────────────
  if (driving.length >= 2 && !m.compositionRoot) {
    verdicts.push({
      pattern: 'plugin or multi-service (disjoint entry cones)',
      confidence: 'MEDIUM',
      evidence: [
        ...driving.map(a => `door: ${a.file}`),
        'no module is reachable from every adapter — the cones are disjoint',
      ],
      caveats: ['a monorepo of services reports per service; one verdict over the whole tree would be wrong by construction'],
    });
  }

  // ── LAYERED MONOLITH: one door, one direction ────────────────────────────
  if (driving.length === 1 && m.layerEdges.length > 0) {
    verdicts.push({
      pattern: 'layered monolith',
      confidence: oneWay ? 'MEDIUM' : 'LOW',
      evidence: [
        `single door: ${driving[0].file}`,
        `${m.layerEdges.length} directory-level dependency edge(s)`,
        oneWay ? 'dependencies flow one way at directory level'
               : `${m.bidirectional.length} bidirectional pair(s) — a layer cake with the layers stirred`,
      ],
      caveats: oneWay ? [] : ['bidirectional pairs contradict strict layering'],
    });
  }

  return { verdicts, shape };
}
