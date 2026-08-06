import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import { closePersistence } from "@/interfaces/cli/shared/context.js";

/**
 * Conducks — Bootstrap Documentation Command
 *
 * Scaffolds the conducks-docs create-now set flat under docs/: features.md, architecture.md,
 * todos/todo01.md, plus handover.md at a root tree, and the empty decisions/ and todos/completed/
 * folders. `architecture.md` is a SKELETON a person fills — conducks writes no generated structure
 * (ADR 0011). `conventions.md`, `memory.md` and module notes (`visuals/modules/`, ADR 0140) are create-when-first-needed and are
 * deliberately not scaffolded. Every file written passes `conducks docs-lint` by construction.
 *
 * `--service` writes the service shape: no handover.md, since constraints are root-only.
 */
export class BootstrapDocsCommand implements ConducksCommand {
  public id = "bootstrap-docs";
  public description = "Scaffold the conducks-docs grammar file set into docs/";
  public usage = "conducks bootstrap-docs [project_name] [--service]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const projectRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
    const kind = args.includes("--service") ? "service" as const : "root" as const;
    const projectName = args.find(a => !a.startsWith("--")) || path.basename(projectRoot);

    try {
      console.log(`[Manifest] Bootstrapping ${kind} documentation for: ${projectName}...`);

      // The manifest facade lives on registry.status (bootstrap/record).
      const created = await registry.status.bootstrap(projectRoot, projectName, kind);

      if (created.length === 0) {
        console.log(`✅ Documentation for ${projectName} is already up to standard.`);
      } else {
        console.log(`✅ Successfully bootstrapped ${created.length} manifest files:`);
        created.forEach((file: string) => console.log(`  - ${file}`));
        console.log(`\n\x1b[90mLocation: docs/ — validate with \`conducks docs-lint\`\x1b[0m`);
      }
    } catch (err) {
      console.error(`Bootstrap Error: ${(err as Error).message}`);
      process.exit(1);
    } finally {
      await closePersistence(registry);
    }
  }
}
