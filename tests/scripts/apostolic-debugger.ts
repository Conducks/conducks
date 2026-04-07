import { registry } from "../../src/registry/index.js";
import { chronicle } from "../../src/lib/core/git/chronicle-interface.js";
import path from "node:path";

async function debugSync() {
    console.log("🛡️ [Apostolic Debugger] Initializing Structural Synapse...");
    const targetRoot = path.join(process.cwd(), '../archive/TargetedCV');
    
    // Force Anchor
    process.chdir(targetRoot);
    
    await registry.initialize(true, targetRoot);
    
    console.log(`🛡️ [Apostolic Debugger] Anchored at: ${targetRoot}`);
    console.log(`🛡️ [Apostolic Debugger] Vault Stats: ${registry.query.graph.getGraph().stats.nodeCount} nodes`);
    
    const query = "application/src/lib/core";
    console.log(`🛡️ [Apostolic Debugger] Searching for: ${query}`);
    
    const results = await registry.analyze.query.execute('find_by_name', [query, '', ''], 20);
    
    if (results.length === 0) {
        console.log("❌ No symbols found in core branch.");
        
        // Let's check why - is it in the graph but not in the query?
        const allNodes = Array.from(registry.query.graph.getGraph().getAllNodes());
        const appNodes = allNodes.filter((n: any) => n.properties.filePath?.toLowerCase().includes("application"));
        console.log(`🛡️ [Apostolic Debugger] Found ${appNodes.length} symbols containing 'application' in the graph.`);
        
        if (appNodes.length > 0) {
            console.log("Sample Application Nodes:");
            appNodes.slice(0, 5).forEach((n: any) => console.log(`- ${n.id} (${n.properties.filePath})`));
        }
    } else {
        console.log(`✅ Found ${results.length} symbols in core branch.`);
    }

    process.exit(0);
}

debugSync().catch(console.error);
