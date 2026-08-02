import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import fs from "node:fs";

/**
 * Conducks — List Command
 *
 * Reports the anchored workspace and the projects `conducks link` has actually persisted to
 * `<root>/.conducks/links.json`. That file is the only federation state that exists — there is no
 * federation table in the DuckDB synapse — so it is also the only thing this command can enumerate.
 *
 * A link is CHECKED here, not merely echoed. `link` verifies the target holds a synapse at the
 * moment it is written and nothing ever looks again, so a project that was deleted, moved, or had
 * its vault cleared was listed exactly like a live one (ADR 0114).
 */
export class ListCommand implements ConducksCommand {
  public id = "list";
  public description = "Show the anchored workspace and any linked federated projects";
  public usage = "conducks list [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes('--json');
    // Same root expression as `conducks link` — it must read the file that command writes.
    const root = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();

    let links: string[];
    try {
      links = await registry.federation.createLinker(root).getLinks();
    } catch (err) {
      // An unreadable link list is a FAILURE, not an empty one. Reporting "no links" here is how a
      // corrupt file came to look like a clean workspace.
      console.error(`\x1b[31m❌ ${(err as Error).message}\x1b[0m`);
      process.exit(1);
      return;
    }

    /** A link is live when the target still holds an analyzed synapse — the same test `link` applies. */
    const check = (p: string) => {
      const db = path.join(p, '.conducks', 'conducks-synapse.db');
      if (!fs.existsSync(p)) return 'missing';
      return fs.existsSync(db) ? 'ok' : 'not-analyzed';
    };
    const rows = links.map(p => ({ path: p, status: check(p) }));

    if (useJson) {
      process.stdout.write(JSON.stringify({ workspace: root, links: rows }, null, 2) + '\n');
      return;
    }

    console.log("--- 🌐 Federated Synapses ---");
    console.log(`Workspace: ${root}`);

    if (rows.length === 0) {
      console.log("No federated projects linked.");
      console.log("Link one with: conducks link <path-to-conducks-project>");
      return;
    }

    console.log(`Linked projects (${rows.length}):`);
    for (const r of rows) {
      const mark = r.status === 'ok' ? '\x1b[32m✓\x1b[0m'
        : r.status === 'missing' ? '\x1b[31m✗ path no longer exists\x1b[0m'
        : '\x1b[33m! linked but never analyzed — run `conducks analyze` there\x1b[0m';
      console.log(`- ${r.path} ${mark}`);
    }

    const broken = rows.filter(r => r.status !== 'ok').length;
    if (broken > 0) {
      console.log(`\n\x1b[33m${broken} of ${rows.length} link(s) no longer resolve.\x1b[0m`);
    }
  }
}
