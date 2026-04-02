import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";

/**
 * Conducks — Record Command
 * 
 * Records a strategic learning or decision into the manifest.
 */
export class RecordCommand implements ConducksCommand {
  public id = "record";
  public description = "Record a learning, decision, or intent into the Manifest";
  public usage = "conducks record --type [vision|architecture|implementation|handover|conventions|todo|memory] \"content\"";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const typeArg = args.find(a => a.startsWith('--type='));
    const type = typeArg ? typeArg.split('=')[1] : (args[0]?.startsWith('--type') ? args[1] : 'memory');
    const content = args[args.length - 1];

    if (!content || content.startsWith('--')) {
      console.error("Usage: conducks record --type [vision|architecture|implementation|handover|conventions|todo|memory] \"content\"");
      return;
    }

    const projectRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
    const projectName = path.basename(projectRoot);

    // Map common aliases
    const typeMap: Record<string, string> = {
      'convention': 'conventions',
      'rules': 'conventions',
      'learning': 'memory',
      'intent': 'vision',
      'arch': 'architecture',
      'impl': 'implementation'
    };

    const targetType = typeMap[type.toLowerCase()] || type.toLowerCase();

    try {
      console.log(`[Manifest] Recording ${targetType} for ${projectName}...`);
      await (registry as any).manifest.record(projectRoot, projectName, targetType, content);
      console.log(`✅ Recorded successfully in docs/project/${projectName}/${targetType}.md`);
    } catch (err) {
      console.error(`Record Error: ${(err as Error).message}`);
    } finally {
      await registry.infrastructure.persistence.close();
    }
  }
}
