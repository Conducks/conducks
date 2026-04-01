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
 * Interface for a functional tool that can be executed via MCP or CLI.
 */
export interface Tool extends ConducksComponent {
  /** The unique name of the tool for command-line/RPC invocation */
  readonly name: string;
  
  /** JSON Schema for the tool's input arguments */
  readonly inputSchema: any;
  
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
