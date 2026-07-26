/**
 * Conducks — Core Registry Types
 * 
 * Defines the contract for modular components that can be registered
 * with the Conducks intelligence engine.
 */

export type ComponentType = 'parser' | 'analyzer' | 'resolver' | 'tool';

/**
 * Base interface for any modular component in the Conducks system.
 */
export interface ConducksComponent {
  /** Unique identifier for the component (e.g., 'typescript-parser', 'impact-analyzer') */
  readonly id: string;
  
  /** The logic category of the component */
  readonly type: ComponentType;
  
  /** human-readable description of what this component provides */
  readonly description?: string;
  
  /** Optional version of the component for evolution tracking */
  readonly version?: string;
}

/**
 * Metadata for a registry entry, tracked for auditing and status.
 */
export interface RegistryEntry<T extends ConducksComponent> {
  component: T;
  registeredAt: Date;
  status: 'active' | 'deprecated' | 'error';
}

/**
 * MCP tool annotations per the Model Context Protocol spec.
 */
export interface ToolAnnotations {
  /** Hint that the tool does not modify state */
  readOnlyHint?: boolean;
  /** Hint that the tool may perform destructive/irreversible operations */
  destructiveHint?: boolean;
  /** Hint that repeated calls with same args produce the same result */
  idempotentHint?: boolean;
}

/**
 * Which half of conducks a tool belongs to. MCP has no namespaces, so the split is carried as data
 * and surfaced in the description rather than baked into tool names (renaming would break every
 * skill and saved client config for cosmetic gain).
 *
 * The line is a DEPENDENCY boundary, not a category: a `docs` tool reads authored markdown and must
 * work on a folder that was never analyzed — no graph, no DuckDB, no lock. A `code` tool answers
 * from the structural graph and needs a pulse first.
 */
export type ToolLayer = "docs" | "code";

/**
 * Interface for a functional tool that can be executed via MCP or CLI.
 */
export interface Tool extends ConducksComponent {
  /** The unique name of the tool for command-line/RPC invocation */
  readonly name: string;

  /** Which layer this tool belongs to — defaults to "code" when unset. */
  readonly layer?: ToolLayer;

  /** JSON Schema for the tool's input arguments */
  readonly inputSchema: any;

  /** MCP tool annotations describing tool behavior hints */
  readonly annotations?: ToolAnnotations;

  /** The execution logic for the tool */
  handler: (args: any) => Promise<any>;

  /** Mandatory formatter to convert the raw result into a human-readable string */
  formatter: (res: any) => string;
}

/**
 * Base configuration for a registry instance.
 */
export interface RegistryConfig {
  /** Maximum number of components allowed (optional) */
  maxComponents?: number;
}
