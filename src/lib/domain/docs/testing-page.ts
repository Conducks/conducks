/**
 * Conducks — where the manual testing checklist is, and where it should be READ.
 *
 * `conducks-visuals` §0 makes `testing.html` an instrument rather than a record: a human opens it,
 * works through the tasks, copies the report out, and nothing accumulates on the page. So the only
 * question worth answering from a terminal is *where do I open this*, and the answer stopped being
 * "the browser" when ForgeTerm learned to draw the same source in a pane (ADR 0154).
 *
 * **It TELLS, it does not drive.** Nothing here opens a pane, and that is deliberate: ForgeTerm has
 * no control channel, so opening one would mean a new protocol message, a CLI to send it, and a
 * `proto::VERSION` bump that restarts every running shell in every window — to save one keystroke.
 * The environment already carries the one fact that matters, so the honest version of "ForgeTerm
 * first, the browser as the fallback" is to name the chord and let the person press it.
 */
import fs from "node:fs";
import path from "node:path";

/** Where the checklist lives, and how much of it has been worked through. */
export interface TestingPage {
  /** The authored source a person edits, or null when the repo has none. */
  source: string | null;
  /** The rendered page a browser opens, or null when nothing has been generated. */
  page: string | null;
  /** Every task on the page, deferred and dropped included. */
  total: number;
  /** Tasks marked done. */
  done: number;
}

/** Where a checklist is read: inside the terminal that can draw it, or the browser. */
export type Target = "forgeterm" | "browser";

/**
 * The chord that splits a plugin pane in ForgeTerm, as a person reads it.
 *
 * A constant rather than a lookup because conducks cannot ask ForgeTerm anything — see the note at
 * the top. It is spelled the way macOS spells a chord (ForgeTerm ADR 0041), and if that ever moves
 * this is the one line that has to move with it.
 */
export const FORGETERM_PLUGIN_CHORD = "⌘⇧O";

/**
 * Which target this shell should be told about.
 *
 * ForgeTerm exports `FORGETERM=1` into every pane it starts, so a process running inside one can
 * know it without asking. Anything else — a plain terminal, an editor, CI — gets the browser, which
 * is what has always worked there.
 *
 * A shell ForgeTerm did not start exports nothing even when a ForgeTerm window is open somewhere on
 * the machine. That is the right answer rather than a gap: the pane would open in a window the
 * person is not looking at.
 */
export function renderTarget(env: NodeJS.ProcessEnv): Target {
  return env.FORGETERM ? "forgeterm" : "browser";
}

/**
 * Read the checklist's two files, counting the tasks in the SOURCE.
 *
 * Counted from the source and never from the rendered page: the page is generated, and counting a
 * derived artefact means the number is wrong for exactly as long as somebody has edited the source
 * and not re-run the generator — which is the moment the count is most likely to be looked at.
 *
 * `visuals/` is root-only (`conducks-docs` §3.2), so there is one checklist per repository however
 * many services it holds.
 */
export function readTestingPage(root: string): TestingPage {
  const source = path.join(root, "docs", "visuals", "testing.md");
  const page = path.join(root, "docs", "visuals", "testing.html");
  const text = readOrNull(source);
  return {
    source: text === null ? null : source,
    page: fs.existsSync(page) ? page : null,
    total: text === null ? 0 : count(text, /^\s*-\s*\[.\]/gm),
    done: text === null ? 0 : count(text, /^\s*-\s*\[[xX]\]/gm),
  };
}

function readOrNull(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    // Absent, unreadable, a directory — all the same answer to the caller, which is "this repo has
    // no checklist". A repo with no manual testing to do is a finished state, not a broken one
    // (`conducks-visuals` §0).
    return null;
  }
}

function count(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}
