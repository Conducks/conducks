import { ApostleCommand } from "../command.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";

/**
 * Conducks — Help Command
 */
export class HelpCommand implements ApostleCommand {
  public id = "help";
  public description = "Show this help message";
  public usage = "conducks help";

  constructor(private commands: ApostleCommand[]) {}

  public async execute(_args: string[], _persistence: SynapsePersistence): Promise<void> {
    console.log(`
  Conducks — Technical Intelligence CLI
 
  Usage: conducks [command] [options]
 
  Commands:`);
    
    this.commands.forEach(cmd => {
      const padding = " ".repeat(Math.max(2, 16 - cmd.id.length));
      console.log(`    ${cmd.id}${padding}${cmd.description}`);
    });
    console.log("");
  }
}
