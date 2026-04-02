import type { Registry } from "@/registry/index.js";

/**
 * Conducks — Command Interface
 */
export interface ConducksCommand {
  id: string;
  description: string;
  usage: string;
  execute(args: string[], registry: Registry): Promise<void>;
}


// Conducks Command Interface (Common)
