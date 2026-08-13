import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { execSync } from "child_process";

function safeKill(pidStr: string): boolean {
  const pid = parseInt(pidStr, 10);
  if (!Number.isInteger(pid) || pid <= 1 || pid > 4194304) return false;
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

/**
 * Conducks — Nuclear Clean Command
 * 
 * Purge the local cache and evict blocked structural handles.
 */
export class CleanCommand implements ConducksCommand {
  public id = "clean";
  public description = "Nuclear Purge: Evict blocked handles and purge structural cache";
  public usage = "conducks clean";

  public async execute(_args: string[], registry: Registry): Promise<void> {
    console.log("🛡️ Starting Nuclear Clean protocol...");

    // 1. Surgical Process Eviction: Kill only background Conducks/MCP servers
    try {
      const myPid = process.pid;
      const myParentPid = process.ppid;
      const projectRoot = registry.infrastructure.chronicle.getProjectDir() || process.cwd();
      
      // Patterns that specifically identify a CONDUCKS background execution
      const targetPatterns = [
        "build/src/interfaces/cli/index.js",
        "build/src/interfaces/tools/server.js",
        "build/src/interfaces/web/mirror-server.js",
        "src/interfaces/cli/index.ts" // ts-node fallback
      ];

      // Use 'ps' to find processes and parse them in Node for total safety
      const output = execSync("ps aux | grep node | grep -v grep").toString();
      const lines = output.split("\n");
      const victims: number[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        const pidStr = parts[1];
        const fullCmd = line.toLowerCase();

        // Validate PID is a numeric string before parsing
        if (!/^\d+$/.test(pidStr)) continue;
        const pid = parseInt(pidStr, 10);

        // Safety Filter: Never kill myself or my Parent (The Sun/IDE)
        if (pid === myPid || pid === myParentPid) continue;

        // Surgical Check: Does this process run a recognized Conducks entry point?
        const isConducks = targetPatterns.some(pattern => fullCmd.includes(pattern.toLowerCase()));

        // SCOPED TO THIS PROJECT, and that is a correctness fix rather than a nicety (todo65).
        //
        // The match above is on the ENTRY POINT — `build/src/interfaces/cli/index.js` — which every
        // conducks process on the machine shares. So `conducks clean` in one repository killed
        // conducks running in ANOTHER: a `watch` in a second project, a colleague's MCP server, an
        // `analyze` half way through writing its vault. Reproduced directly: a `watch` started in a
        // temp project was gone the moment `clean` ran here.
        //
        // It also made the test suite unrunnable in parallel. Three suites run `clean`, and with two
        // jest workers one suite's clean killed whatever another worker had in flight — which is why
        // the victim differed every run and why even `status --help`, a command that does no work,
        // came back `signal=SIGTERM` (todo65 spent an afternoon on the wrong suspects for this).
        //
        // The project a process belongs to is its CWD, which `ps` does not report, so it is read per
        // candidate. A process whose CWD cannot be read is LEFT ALONE: this command kills things, and
        // "I could not tell" must not resolve to "kill it".
        const belongsToThisProject = isConducks && (() => {
          try {
            const cwd = execSync(`lsof -a -d cwd -p ${pid} -Fn 2>/dev/null | grep '^n' | head -1`)
              .toString().trim().slice(1);
            return !!cwd && (cwd === projectRoot || cwd.startsWith(projectRoot + '/'));
          } catch {
            return false;
          }
        })();

        if (belongsToThisProject) {
          victims.push(pid);
        }
      }

      if (victims.length > 0) {
        console.log(`📡 Evicting ${victims.length} surgical targets...`);
        for (const victim of victims) {
          safeKill(String(victim));
        }
      }
    } catch { /* Error in ps or no node processes */ }


    // 2. Structural Cache Purge
    await registry.infrastructure.persistence.clear();
    
    console.log("✅ Structural handles evicted and memory cache purged.");
  }
}

