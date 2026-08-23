// Types for the problems.md / holding.md / index.md parser and renderer, so its test can import it
// under `checkJs: false`. The script itself stays plain .mjs — it is run directly by `npm run
// visuals`, uncompiled.
export interface ParsedPage {
  title: string;
  provenance: string | null;
  sub: string;
  blocksHtml: string;
}

export interface PageMeta {
  src: string;
  titleSuffix: string;
  current: string;
}

export declare function parsePage(md: string): ParsedPage;
export declare function renderPage(md: string, meta: PageMeta): string;
