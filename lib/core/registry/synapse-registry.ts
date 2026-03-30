import { ConducksComponent } from "./types.js";

/**
 * Apostle — Synapse Registry
 * 
 * The central plugin-first registry for the Gospel of Technology.
 * Manages 'Apostle Suites' (Language Providers, Resonators, and Analyzers).
 */

export interface ApostleSuite {
  name: string;
  version: string;
  register(synapse: any): void; // Any for now to avoid circularity with Conducks main class
}

export class SynapseRegistry<T extends ConducksComponent> {
  private components = new Map<string, T>();
  private suites = new Map<string, ApostleSuite>();
  private providers = new Map<string, any>(); // Maps extension (e.g., .py) to Provider

  public registerSuite(suite: ApostleSuite, synapse: any): void {
    if (this.suites.has(suite.name)) return;
    this.suites.set(suite.name, suite);
    suite.register(synapse);
    console.error(`[Synapse Registry] Registered Apostle Suite: ${suite.name} (v${suite.version})`);
  }

  public registerComponent(component: T): void {
    const id = component.id;
    this.components.set(id, component);
    console.error(`[Synapse Registry] Component Registered: ${id}`);
  }

  public registerProvider(extension: string, provider: any): void {
    this.providers.set(extension, provider);
    console.error(`[Synapse Registry] Language Provider Registered for [${extension}]`);
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

  public getSuites(): ApostleSuite[] {
    return Array.from(this.suites.values());
  }
}
