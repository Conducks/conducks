/**
 * Conducks — High-Fidelity Swift SCM Query 🏺 🟦 (Omni-Detail)
 *
 * Grammar contract: tree-sitter-swift 0.7.1 (alex-pinkus).
 * That grammar has NO `struct_declaration` / `enum_declaration` / `extension_declaration`. Every
 * nominal type folds into `class_declaration`, discriminated by the anonymous `declaration_kind:`
 * field (class | actor | struct | enum | extension). Asking for the missing node types failed the
 * WHOLE query (TSQueryErrorNodeType at 146), which silently dropped every .swift file to the Gnosis
 * file-only fallback. Every pattern below is compiled against the installed grammar by
 * tests/unit/core/languages/swift-extraction.test.ts — keep it that way.
 */
import { scm } from '../scm.js';

export const SWIFT_QUERIES = scm(import.meta.url, './queries.scm');
