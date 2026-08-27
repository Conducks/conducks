import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { spawn } from "node:child_process";
import path from "node:path";
import chalk from "chalk";

/**
 * Conducks — Testing Command 🧪
 *
 * Where the manual checklist is, how far through it anyone is, and where to open it.
 *
 * **It tells, it does not drive.** Inside ForgeTerm it names the chord that draws the checklist as a
 * pane; anywhere else it opens the browser, which is what has always worked there. It never asks
 * ForgeTerm to do anything, because ForgeTerm has no way to be asked — opening a pane from out here
 * would mean a new protocol message, a CLI to send it, and a `proto::VERSION` bump that restarts
 * every running shell in every window, to save one keystroke.
 *
 * That restraint is the decision `forgeterm:todo18#P4` parked and this closes: a fallback written
 * before its primary has earned its place ends up serving one caller.
 */
export class TestingCommand implements ConducksCommand {
  public id = "testing";
  public description = "Where the manual testing checklist is, and where to open it";
  public usage = "conducks testing [path] [--no-open]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const posArg = args.find(a => !a.startsWith("--"));
    const root = posArg ? (posArg.startsWith("/") ? posArg : path.resolve(process.cwd(), posArg)) : process.cwd();
    const page = registry.docs.testingPage(root);

    // A repo with no checklist is a FINISHED state, not a broken one: `conducks-visuals` §0 builds
    // the page only where a human is doing manual passes over something no test can reach, which is
    // most GUI work and almost no library work. So this says so and exits 0.
    if (!page.source) {
      console.log(chalk.dim(`\nno checklist here — ${path.relative(root, path.join(root, "docs/visuals/testing.md"))} does not exist`));
      console.log(chalk.dim(`it is built when somebody is testing by hand (conducks-visuals §0)\n`));
      return;
    }

    const left = page.total - page.done;
    console.log(`\n${chalk.bold(path.relative(root, page.page ?? page.source))}  ${chalk.dim(`— ${page.total} tasks, ${page.done} done, ${left} not run`)}`);

    const target = registry.docs.renderTarget();
    if (target === "forgeterm") {
      // The source, not the page: in ForgeTerm the plugin draws the authored file directly, so a
      // stale render is not something the reader has to think about.
      console.log(`\n${chalk.cyan("You are in ForgeTerm")} — ${chalk.bold(registry.docs.forgetermChord())} opens the checklist as a pane, live against the source.\n`);
      return;
    }

    if (!page.page) {
      console.log(chalk.yellow(`\nnothing rendered yet — run the repo's visuals generator, then open it\n`));
      return;
    }
    if (args.includes("--no-open")) {
      console.log(chalk.dim(`\n${page.page}\n`));
      return;
    }
    this.openInBrowser(page.page);
    console.log(chalk.dim(`\nopened in your browser\n`));
  }

  /**
   * Hand the page to whatever the platform opens pages with.
   *
   * Detached and with its output thrown away, so a browser that logs to stderr on launch does not
   * write over the summary above — and so this command exits rather than living as long as the
   * browser does.
   */
  private openInBrowser(file: string): void {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    try {
      spawn(opener, [file], { detached: true, stdio: "ignore" }).unref();
    } catch {
      // No opener is not a failure worth an exit code: the path is already printed above, and the
      // caller can open it themselves.
    }
  }
}
