import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { execSync } from "child_process";

/**
 * Conducks — Nuclear Clean Command
 * 
 * Purge the local cache and evict blocked structural handles.
 */
export class CleanCommand implements ConducksCommand {
  public id = "clean";
  public description = "Nuclear Purge: Evict blocked handles and purge structural cache";
  public usage = "conducks clean";

  public async execute(_args: string[], persistence: SynapsePersistence): Promise<void> {
    console.log("🛡️ Starting Nuclear Clean protocol...");

    // 1. Surgical Process Eviction: Kill only background Conducks/MCP servers
    try {
      const myPid = process.pid;
      const myParentPid = process.ppid;
      
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
        const pid = parseInt(parts[1]);
        const fullCmd = line.toLowerCase();

        // Safety Filter: Never kill myself or my Parent (The Sun/IDE)
        if (pid === myPid || pid === myParentPid) continue;

        // Surgical Check: Does this process run a recognized Conducks entry point?
        const isConducks = targetPatterns.some(pattern => fullCmd.includes(pattern.toLowerCase()));
        
        if (isConducks) {
          victims.push(pid);
        }
      }

      if (victims.length > 0) {
        console.log(`📡 Evicting ${victims.length} surgical targets...`);
        for (const pid of victims) {
          try {
            process.kill(pid, 9); // Force SIGKILL
          } catch { /* Ignore */ }
        }
      }
    } catch { /* Error in ps or no node processes */ }


    // 2. Structural Cache Purge
    await persistence.clear();
    
    console.log("✅ Structural handles evicted and memory cache purged.");
  }
}

