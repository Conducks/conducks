import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import path from "node:path";

/**
 * Conducks — Record Command
 * 
 * Records a strategic learning or decision into the manifest.
 */
export class RecordCommand implements ConducksCommand {
  public id = "record";
  public description = "Record a learning, decision, or intent into the Manifest";
  public usage = "registry record --type [vision|convention|memory|todo] \"content\"";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const typeArg = args.find(a => a.startsWith('--type='));
    const type = typeArg ? typeArg.split('=')[1] : (args[0]?.startsWith('--type') ? args[1] : 'memory');
    const content = args[args.length - 1];

    if (!content || content.startsWith('--')) {
      console.error("Usage: registry record --type [vision|convention|memory|todo] \"content\"");
      return;
    }

    const projectRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
    const projectName = path.basename(projectRoot);

    // Map common aliases
    const typeMap: Record<string, string> = {
      'convention': 'conventions',
      'rules': 'conventions',
      'learning': 'memory',
      'intent': 'vision'
    };

    const targetType = typeMap[type.toLowerCase()] || type.toLowerCase();

    try {
      console.log(`[Manifest] Recording ${targetType} for ${projectName}...`);
      await (registry as any).manifest.record(projectRoot, projectName, targetType, content);
      console.log(`✅ Recorded successfully in docs/project/${projectName}/${targetType}.md`);
    } catch (err) {
      console.error(`Record Error: ${(err as Error).message}`);
    } finally {
      await persistence.close();
    }
  }
}
