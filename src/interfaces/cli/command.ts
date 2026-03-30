import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Command Interface
 */
export interface ConducksCommand {
  id: string;
  description: string;
  usage: string;
  execute(args: string[], persistence: SynapsePersistence): Promise<void>;
}


// Conducks Command Interface (Common)
