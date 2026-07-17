import path from "path";

/**
 * Conducks — Java Package Resolver 🏺 🟦
 *
 * Maps Java 'import' directives and packages to file paths.
 */
export class JavaResolver {
  /**
   * Resolves a Java package or import path.
   * Maps Dot-Separated packages to local directories (e.g., com.pkg -> com/pkg).
   */
  public resolve(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    // 1. Clean path (remove import keyword and semicolon), split on dots
    const packageName = rawPath.replace(/^import\s+/, '').replace(/;/g, '').trim();
    // com.example.MyClass -> ['com', 'example', 'MyClass']
    const segments = packageName.split('.');
    const className = segments[segments.length - 1];

    // 2. Find the .java file whose path contains each package segment as an exact path component
    return allFiles.find(p => {
      if (!p.endsWith('.java')) return false;
      const normalized = p.replace(/\\/g, '/').toLowerCase();
      // Must end with the class file
      if (!normalized.endsWith(`/${className.toLowerCase()}.java`)) return false;
      // All package segments (excluding class name) must appear as exact path components in order
      const pathParts = normalized.split('/');
      let segIdx = 0;
      for (const part of pathParts) {
        if (part === segments[segIdx]?.toLowerCase()) segIdx++;
        if (segIdx === segments.length - 1) return true; // matched all package segments (not class)
      }
      return false;
    });
  }
}
