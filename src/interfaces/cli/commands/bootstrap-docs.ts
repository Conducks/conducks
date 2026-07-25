import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import { closePersistence } from "@/interfaces/cli/shared/context.js";

/**
 * Conducks — Bootstrap Documentation Command
 *
 * Scaffolds the conducks-docs grammar file set (features.md, conventions.md, memory.md,
 * progress.md, todos/todo01.md) flat under docs/. No architecture file is written — ADR 0011
 * removed generated architecture output. Every scaffolded file passes `conducks docs-lint`
 * by construction.
 */
export class BootstrapDocsCommand implements ConducksCommand {
  public id = "bootstrap-docs";
  public description = "Scaffold the conducks-docs grammar file set into docs/";
  public usage = "conducks bootstrap-docs [project_name]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const projectRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
    const projectName = args[0] || path.basename(projectRoot);

    try {
      console.log(`[Manifest] Bootstrapping documentation for: ${projectName}...`);

      // The manifest facade lives on registry.status (bootstrap/record).
      const created = await registry.status.bootstrap(projectRoot, projectName);

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
