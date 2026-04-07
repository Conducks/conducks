import path from 'node:path';
import { registry } from "../../build/src/registry/index.js";

async function debug() {
  const root = path.join(process.cwd(), "../archive/orchestrator/application");
  console.log(`🛡️ [Debug] Initializing for: ${root}`);
  await registry.initialize(true, root);
  const status = registry.governance.status();
  console.log(`🛡️ [Debug] Nodes: ${status.stats.nodeCount}`);
  process.exit(0);
}

debug().catch(err => {
  console.error(err);
  process.exit(1);
});
