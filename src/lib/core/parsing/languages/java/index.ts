import { NativeProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { ILanguagePlugin } from "@/lib/core/parsing/language-plugin.js";
import { JAVA_QUERIES } from "./queries.js";
import { JavaResolver } from "./resolver.js";
import { JavaExtractor } from "./extractor.js";

/**
 * Conducks — High-Fidelity Java Language Provider (Suite v3) 🏺 🟦
 *
 * Maps Java structural DNA (Classes, Records, Spring Annotations) to the 8-layer taxonomy.
 */
export class JavaProvider extends NativeProvider implements ILanguagePlugin {
  public readonly id = "java-provider";
  public readonly version = "3.0.0";
  public readonly extensions = [".java"];
  public readonly langId = "java";
  public readonly importSemantics: ImportSemantics = 'wildcard';

  private resolver = new JavaResolver();
  private extractor = new JavaExtractor();

  public readonly queryScm = JAVA_QUERIES;

  /**
   * Delegates package resolution to the Java-specific resolver.
   */
  /** This language's rule for turning a specifier into a file — the one thing a pack cannot share. */
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /**
   * Conducks — Structural Complexity
   * Calculates the branch complexity (Cyclomatic-lite) of a Java node.
   */
  /** Branch count, used as the complexity signal on every symbol this pack produces. */
  public calculateComplexity(node: any): number {
    return this.extractor.calculateComplexity(node);
  }

  /**
   * Conducks — Technical Debt Signals
   * Extracts markers (TODO, FIXME, etc.) from comments.
   */
  /** Debt markers inside a symbol, so "where is the known debt" is a graph question, not a grep. */
  public extractDebt(node: any): string[] {
    return this.extractor.extractDebt(node);
  }
}
