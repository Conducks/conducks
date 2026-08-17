/**
 * Conducks — High-Fidelity JavaScript SCM Query 🏺 🟨 (Omni-Detail)
 *
 * JavaScript-only variant: no TS-specific nodes (interface, type alias, declare,
 * type parameters, abstract classes, decorators). Adds CommonJS require() support.
 */
import { scm } from '../scm.js';
import { EC_DYNAMIC_IMPORT, EC_VALUE_POSITIONS } from '../ecmascript-positions.js';

export const JAVASCRIPT_QUERIES = scm(import.meta.url, './queries.scm', {
  EC_DYNAMIC_IMPORT, EC_VALUE_POSITIONS,
});
