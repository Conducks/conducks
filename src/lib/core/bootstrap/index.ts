/**
 * Conducks — the bootstrap feature's only door (ADR 0150).
 *
 * Environment discovery, grammar initialisation and anchor resolution: the work that has to happen
 * before any of the other core features can answer anything, kept out of the composition root so
 * that root stays a wiring point rather than a procedure.
 *
 * IT SITS ON TOP OF EVERY OTHER CORE DOOR — graph, persistence, git, parsing, utils — which makes it
 * the one feature here that must never be imported BY them. Nothing in core does, and the door gate
 * is what keeps that true. Its single consumer is `src/registry/`, the composition root.
 *
 * A TENSION, RECORDED RATHER THAN RESOLVED: a file that wires five features together and is used by
 * exactly one composition root reads like composition that was placed in core. Moving it to
 * `src/registry/` would be legal under ADR 0005 and is arguably where it belongs. That decision
 * waits for the composition-root unit, which this campaign deliberately does last — deciding it
 * here would be deciding the shape of a layer nobody has measured yet.
 *
 * `tests/architecture/feature-doors.test.ts` fails when anything outside reaches past this file.
 */
export { RegistryBootstrapper } from './registry-bootstrapper.js';
