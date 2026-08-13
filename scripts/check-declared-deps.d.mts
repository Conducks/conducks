// Types for the postbuild declared-dependency gate, so its test can import it under `checkJs: false`.
// The script itself stays plain .mjs — it runs from `npm run build`, before anything is compiled.
export declare function findUndeclaredImports(
  buildDir: string,
  pkg: {
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  },
  opts?: { excluded?: string[]; allowDev?: boolean }
): Array<{ package: string; file: string }>;
