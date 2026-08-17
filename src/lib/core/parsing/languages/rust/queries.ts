/**
 * Conducks — High-Fidelity Rust SCM Query 🏺 🟦 (Omni-Detail)
 */
import { scm } from '../scm.js';

export const RUST_QUERIES = scm(import.meta.url, './queries.scm');
