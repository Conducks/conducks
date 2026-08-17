/**
 * Conducks — TSX SCM Query 🏺 🟦
 *
 * Superset of TypeScript queries with JSX-specific node captures.
 */
import { scm } from '../scm.js';
import { EC_DYNAMIC_IMPORT, EC_VALUE_POSITIONS, TS_PARAM_DEFAULTS, TS_TYPE_POSITIONS } from '../ecmascript-positions.js';

export const TSX_QUERIES = scm(import.meta.url, './queries.scm', {
  EC_DYNAMIC_IMPORT, EC_VALUE_POSITIONS, TS_PARAM_DEFAULTS, TS_TYPE_POSITIONS,
});
