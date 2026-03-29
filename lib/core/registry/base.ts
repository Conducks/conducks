import { ConducksComponent, RegistryEntry, RegistryConfig } from './types.js';

/**
 * Universal Registry Base Implementation
 * 
 * Provides atomic registration, retrieval, and decommissioning of components.
 * This is the foundation for Conducks's evolving architecture.
 */
export class ConducksRegistry<T extends ConducksComponent> {
  private components: Map<string, RegistryEntry<T>> = new Map();
  
  constructor(private readonly config: RegistryConfig = {}) {}

  /**
   * Registers a new component with the Conducks system.
   * Throws if the component already exists to prevent accidental overwrites.
   */
  public register(component: T): void {
    if (this.components.has(component.id)) {
      throw new Error(`Conducks Registry Error: Component with ID "${component.id}" is already registered.`);
    }

    if (this.config.maxComponents && this.components.size >= this.config.maxComponents) {
      throw new Error(`Conducks Registry Error: Maximum capacity (${this.config.maxComponents}) reached.`);
    }

    this.components.set(component.id, {
      component,
      registeredAt: new Date(),
      status: 'active'
    });

    console.log(`[Conducks Registry] Registered: ${component.id} (type: ${component.type}, version: ${component.version})`);
  }

  /**
   * Retrieves a component by its ID. 
   * Returns undefined if the component is not registered.
   */
  public get(id: string): T | undefined {
    return this.components.get(id)?.component;
  }

  /**
   * Returns all registered components of this registry's type.
   */
  public getAll(): T[] {
    return Array.from(this.components.values()).map(entry => entry.component);
  }

  /**
   * Marks a component as deprecated without removing it.
   */
  public deprecate(id: string): void {
    const entry = this.components.get(id);
    if (entry) {
      entry.status = 'deprecated';
    }
  }

  /**
   * Removes a component from the registry.
   */
  public unregister(id: string): boolean {
    return this.components.delete(id);
  }

  /**
   * Returns the total count of registered components.
   */
  public get size(): number {
    return this.components.size;
  }
}
