// Types for the preinstall check, so the suite can import the REAL functions rather than a copy.
// The script itself stays plain .mjs: it runs under `preinstall`, before any build step exists.
export declare const PREBUILT_ABIS: Set<string>;
export declare function prebuildWarning(abi: string, nodeVersion: string): string | null;
