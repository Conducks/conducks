import { ConducksComponent } from "./types.js";

/**
 * Conducks — Synapse Registry
 * 
 * The central plugin-first registry for the Gospel of Technology.
 * Manages 'Conducks Suites' (Language Providers, Resonators, and Analyzers).
 */

export interface ConducksSuite {
  name: string;
  version: string;
  register(synapse: any): void; // Any for now to avoid circularity with Conducks main class
}

export class SynapseRegistry<T extends ConducksComponent> {
  private components = new Map<string, T>();
  private suites = new Map<string, ConducksSuite>();
  private providers = new Map<string, any>(); // Maps extension (e.g., .py) to Provider

  public registerSuite(suite: ConducksSuite, synapse: any): void {
    if (this.suites.has(suite.name)) return;
    this.suites.set(suite.name, suite);
    suite.register(synapse);
  }

  public registerComponent(component: T): void {
    const id = component.id;
    this.components.set(id, component);
  }

  public registerProvider(extension: string, provider: any): void {
    this.providers.set(extension, provider);
  }

  public getComponent(id: string): T | undefined {
    return this.components.get(id);
  }

  public getProvider(extension: string): any | undefined {
    return this.providers.get(extension);
  }

  public getAllComponents(): T[] {
    return Array.from(this.components.values());
  }

  public getSuites(): ConducksSuite[] {
    return Array.from(this.suites.values());
  }
}
