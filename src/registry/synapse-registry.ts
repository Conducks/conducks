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
  private providersByExtension = new Map<string, any>(); // Maps extension (e.g., .py)
  private providersByFilename = new Map<string, any>();  // Maps exact name (e.g., package.json)

  public registerSuite(suite: ConducksSuite, synapse: any): void {
    if (this.suites.has(suite.name)) return;
    this.suites.set(suite.name, suite);
    suite.register(synapse);
  }

  public registerComponent(component: T): void {
    const id = component.id;
    this.components.set(id, component);
  }

  public registerProvider(pattern: string, provider: any): void {
    if (pattern.startsWith('.')) {
      this.providersByExtension.set(pattern, provider);
    } else {
      this.providersByFilename.set(pattern, provider);
    }
  }

  public getComponent(id: string): T | undefined {
    return this.components.get(id);
  }

  public getProvider(filePath: string): any | undefined {
    const fileName = (filePath.includes('/') || filePath.includes('\\')) 
      ? filePath.split(/[/\\]/).pop()! 
      : filePath;
    
    // 1. Exact Filename Match (Priority)
    const byName = this.providersByFilename.get(fileName);
    if (byName) return byName;

    // 2. Extension Match (Fallback)
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex !== -1) {
      const ext = fileName.slice(dotIndex);
      return this.providersByExtension.get(ext);
    }

    return undefined;
  }

  public getAllComponents(): T[] {
    return Array.from(this.components.values());
  }

  public getSuites(): ConducksSuite[] {
    return Array.from(this.suites.values());
  }
}
