import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";

/**
 * Conducks — List Command
 *
 * Reports the anchored workspace and the projects `conducks link` has actually persisted to
 * `<root>/.conducks/links.json`. That file is the only federation state that exists — there is no
 * federation table in the DuckDB synapse — so it is also the only thing this command can enumerate.
 */
export class ListCommand implements ConducksCommand {
  public id = "list";
  public description = "Show the anchored workspace and any linked federated projects";
  public usage = "conducks list";

  public async execute(_args: string[], registry: Registry): Promise<void> {
    // Same root expression as `conducks link` — it must read the file that command writes.
    const root = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
    const links = await registry.federation.createLinker(root).getLinks();

    console.log("--- 🌐 Federated Synapses ---");
    console.log(`Workspace: ${root}`);

    if (links.length === 0) {
      console.log("No federated projects linked.");
      console.log("Link one with: conducks link <path-to-conducks-project>");
      return;
    }

    console.log(`Linked projects (${links.length}):`);
    links.forEach(link => console.log(`- ${link}`));
  }
}
