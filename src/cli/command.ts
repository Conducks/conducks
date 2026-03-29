import { SynapsePersistence } from "../../lib/core/graph/persistence.js";

/**
 * Conducks — Apostle Command Interface
 */
export interface ApostleCommand {
  id: string;
  description: string;
  usage: string;
  execute(args: string[], persistence: SynapsePersistence): Promise<void>;
}
