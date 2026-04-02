import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";

/**
 * Conducks — Bootstrap Documentation Command
 * 
 * Implements DOCS-1: Automatically creates the 7 essential 
 * documentation files for a service.
 */
export class BootstrapDocsCommand implements ConducksCommand {
  public id = "bootstrap-docs";
  public description = "Initialize the 7-file documentation standard (Manifest)";
  public usage = "registry bootstrap-docs [project_name]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const projectRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
    const projectName = args[0] || path.basename(projectRoot);

    try {
      console.log(`[Manifest] Bootstrapping documentation for: ${projectName}...`);
      
      const created = await (registry as any).manifest.bootstrap(projectRoot, projectName);

      if (created.length === 0) {
        console.log(`✅ Documentation for ${projectName} is already up to standard.`);
      } else {
        console.log(`✅ Successfully bootstrapped ${created.length} manifest files:`);
        created.forEach((file: string) => console.log(`  - ${file}`));
        console.log(`\n\x1b[90mLocation: docs/project/${projectName}/\x1b[0m`);
      }
    } catch (err) {
      console.error(`Bootstrap Error: ${(err as Error).message}`);
    } finally {
      await registry.infrastructure.persistence.close();
    }
  }
}
