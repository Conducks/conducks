/**
 * Conducks — High-Fidelity TypeScript SCM Query 🏺 🟦 (Omni-Detail)
 * 
 * Captures Decorators, Interfaces, Type Aliases, and Heritage.
 */
import { scm } from '../scm.js';
import { EC_DYNAMIC_IMPORT, EC_VALUE_POSITIONS, TS_PARAM_DEFAULTS, TS_TYPE_POSITIONS } from '../ecmascript-positions.js';

export const TYPESCRIPT_QUERIES = scm(import.meta.url, './queries.scm', {
  EC_DYNAMIC_IMPORT, EC_VALUE_POSITIONS, TS_PARAM_DEFAULTS, TS_TYPE_POSITIONS,
});
