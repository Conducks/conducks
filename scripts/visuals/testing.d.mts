// Types for the testing.md parser/renderer, so its test can import it under `checkJs: false`.
// The script itself stays plain .mjs — it is run directly by `npm run visuals`, uncompiled.
export interface Task {
  id: string;
  marker: string;
  text: string;
  pass: string | null;
}
export interface Feature {
  id: string;
  name: string;
  how: string;
  note: string;
  tasks: Task[];
}
export interface Section {
  title: string;
  blurb: string;
  features: Feature[];
}
export interface ParsedTesting {
  title: string;
  provenance: string | null;
  sections: Section[];
}
export interface RenumberViolation {
  id: string;
  text: string;
  movedFrom: string[];
}

export declare function parseTesting(md: string): ParsedTesting;
export declare function detectRenumbering(
  oldTasks: Map<string, string>,
  newTasks: Map<string, string>
): RenumberViolation[];
export declare function taskMap(parsed: ParsedTesting): Map<string, string>;
export declare function renderTesting(md: string): string;
