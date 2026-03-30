import { ConducksComponent } from '@/registry/types.js';

/**
 * Metadata for a file to be parsed.
 */
export interface ParseRequest {
  path: string;
  source: string;
}

/**
 * Result of a successful parsing operation.
 */
export interface ParseResult {
  nodes: Array<{
    name: string;
    label: string;
    startLine: number;
    endLine: number;
    properties: Record<string, any>;
  }>;
  relationships: Array<{
    sourceName: string;
    targetName: string;
    type: string;
    confidence: number;
  }>;
}

/**
 * Abstract Language Plugin Base
 * 
 * Every language supported by Conducks must implement this interface
 * and register itself with the Language Registry.
 */
export abstract class LanguagePlugin implements ConducksComponent {
  public abstract readonly id: string;
  public readonly type = 'parser';
  public abstract readonly version: string;
  public abstract readonly extensions: string[];

  /**
   * Main parsing logic for the specific language.
   * Leverages Tree-sitter (or other libraries) to extract Conducks-compliant nodes and edges.
   */
  public abstract parse(request: ParseRequest): Promise<ParseResult>;

  /**
   * Identifies if a file is supported by this plugin based on its extension or content.
   */
  public isSupported(filePath: string): boolean {
    const ext = filePath.split('.').pop()?.toLowerCase();
    return ext ? this.extensions.includes(ext) : false;
  }
}
