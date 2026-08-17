import { scm } from '../scm.js';

/**
 * Conducks — High-Fidelity C SCM Query 🏺 🟦 (Omni-Detail)
 *
 * The patterns are in `queries.scm` beside this file (todo31). See `../scm.ts` for why they are not
 * in a template literal and how the path resolves in jest, in the built CLI and in a spawned worker.
 */
export const C_QUERIES = scm(import.meta.url, './queries.scm');
