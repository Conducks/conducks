import { PrismSpectrum } from "../prism-core.js";

/**
 * Apostle — Call Processor
 * 
 * Handles call-site analysis, constructor inference, and return type propagation.
 */
export class CallProcessor {
  /**
   * Processes a call-site capture (@kinesis_target) and identifies its relationship.
   */
  public process(target: string, source: string, type: 'CALLS' | 'CONSTRUCTS', spectrum: PrismSpectrum, args: string[] = []): void {
    if (!target) return;

    spectrum.relationships.push({
      sourceName: source || 'global',
      targetName: target,
      type: type,
      confidence: 0.85,
      metadata: { arguments: args }
    });
  }


  /**
   * Identifies if a name-to-name call is a constructor call.
   * e.g. In Python `new User()` or Java `new User()` or Go `User{}`
   */
  public isConstructor(name: string, provider: any): boolean {
    // Basic heuristic: Starts with uppercase (capitalized class)
    return /^[A-Z]/.test(name);
  }
}
