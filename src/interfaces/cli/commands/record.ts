import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import { closePersistence } from "@/interfaces/cli/shared/context.js";

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
    // `--type` is read WHEREVER it appears, in either form.
    //
    // It used to be read only as `--type=x`, or as `args[1]` when `--type` happened to be `args[0]`.
    // So `conducks record "a conventions note" --type conventions` fell through to the default and
    // announced "✅ Recorded in docs/memory.md" — the user asked for one file and a different one
    // was written, under a tick (ADR 0122).
    const eqForm = args.find(a => a.startsWith('--type='));
    const spaceAt = args.indexOf('--type');
    const type = eqForm
      ? eqForm.slice('--type='.length)
      : (spaceAt !== -1 ? args[spaceAt + 1] : 'memory');

    // The CONTENT is the first positional, not the last argument.
    //
    // `args[args.length - 1]` is the flag's value whenever `--type <x>` comes last, so
    // `record "the real note" --type conventions` stored the word "conventions" and threw the note
    // away. The note was gone and the command reported success.
    const typeValueIdx = eqForm ? -1 : spaceAt + 1;
    const content = args.find((a, i) => !a.startsWith('-') && i !== typeValueIdx);

    if (!content) {
      console.error("Usage: conducks record --type [vision|architecture|implementation|handover|conventions|todo|memory] \"content\"");
      process.exit(1);
    }

    // Anchored on the project the dispatcher resolved, so recording from a subdirectory writes into
    // the project's `docs/` rather than making a new one where the user happened to stand (ADR 0116).
    const projectRoot = registry.infrastructure.chronicle.getProjectDir()
      || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
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

    // A TYPE THAT IS NOT ONE OF THE SEVEN IS REFUSED. `--type=nonsensetype` wrote
    // `docs/nonsensetype.md` — a file inside a governed tree that the standard does not define, that
    // `docs-lint` has no rules for, and that nobody looking for the note will ever open (ADR 0122).
    const KNOWN = ['vision', 'architecture', 'implementation', 'handover', 'conventions', 'todo', 'memory'];
    if (!KNOWN.includes(targetType)) {
      console.error(`Unknown record type '${type}'. Expected one of: ${KNOWN.join(', ')}.`);
      console.error(`Aliases: ${Object.entries(typeMap).map(([k, v]) => `${k}→${v}`).join(', ')}`);
      process.exitCode = 1;
      return;
    }

    try {
      console.log(`[Manifest] Recording ${targetType} for ${projectName}...`);
      await registry.status.record(projectRoot, projectName, targetType, content);
      console.log(`✅ Recorded in docs/${targetType}.md`);
    } catch (err) {
      console.error(`Record Error: ${(err as Error).message}`);
      process.exit(1);
    } finally {
      await closePersistence(registry);
    }
  }
}
