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
  
  /** Version of the component for evolution tracking */
  readonly version: string;
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
 * Base configuration for a registry instance.
 */
export interface RegistryConfig {
  /** Maximum number of components allowed (optional) */
  maxComponents?: number;
}
