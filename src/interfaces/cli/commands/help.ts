import { ConducksCommand } from "@/interfaces/cli/command.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Help Command
 */
export class HelpCommand implements ConducksCommand {
  public id = "help";
  public description = "Show this help message";
  public usage = "registry help";

  constructor(private commands: ConducksCommand[]) {}

  public async execute(_args: string[], _persistence: SynapsePersistence): Promise<void> {
    console.log(`
  Conducks — Technical Intelligence CLI
 
  Usage: registry [command] [options]
 
  Commands:`);
    
    this.commands.forEach(cmd => {
      const padding = " ".repeat(Math.max(2, 16 - cmd.id.length));
      console.log(`    ${cmd.id}${padding}${cmd.description}`);
    });
    console.log("");
  }
}
