/**
 * Conducks — the federation feature's only door (ADR 0150).
 *
 * Everything about conducks' relationship to the MACHINE and to other projects, rather than to the
 * code in front of it. Which projects on this machine use conducks, whether a newer version exists,
 * and the three things `setup` installs: the skills, the pre-commit hook, and the MCP server entry.
 *
 * That is what makes it a feature rather than a folder. Every other domain area answers a question
 * about the code being analyzed; this one answers questions about the installation.
 *
 * A LEAF. It imports nothing else in `domain`, which is why it is the first area cleaned — a failure
 * here is attributable to this area rather than to something underneath it (rule 13).
 *
 * WHAT DELIBERATELY DOES NOT CROSS: `SyncReport`, `SkillScope`, `GitActivity`, `UpdateStatus` and
 * `gateBlock`. Each is named only inside this folder — a return shape a caller destructures, or the
 * hook's own text. A door exports what CROSSES, and these do not.
 *
 * `tests/architecture/feature-doors.test.ts` fails when anything outside reaches past this file.
 */
export { ProjectRegistry, probeGitActivity } from './project-registry.js';
export type { RegisteredProject } from './project-registry.js';

export { ConducksInstaller } from './conducks-installer.js';
export { installHook } from './hook-installer.js';
export type { HookInstallResult } from './hook-installer.js';
export { MCPConfigurator } from './mcp-configurator.js';
export { UpdateCheck } from './update-check.js';
