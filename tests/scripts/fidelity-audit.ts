import { registry } from "../../src/registry/index.js";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

async function runAudit() {
    process.env.CONDUCKS_WORKSPACE_ROOT = path.join(process.cwd(), '../archive/TargetedCV');
    const targetRoot = path.join(process.cwd(), '../archive/TargetedCV');
    
    console.log("🏺 [Conducks Structural Audit] Initializing Fidelity Pulse...");
    await registry.initialize(true, targetRoot);
    
    const submodules = [
        "admin-service",
        "analytics-monitoring",
        "application",
        "CV-manipulation",
        "data",
        "docs",
        "go-llms",
        "migrations"
    ];

    console.log(`\n| Submodule | Disk Folders | Synapse Folders | Disk Files | Synapse Units | Fidelity |`);
    console.log(`| :--- | :--- | :--- | :--- | :--- | :--- |`);

    for (const sub of submodules) {
        const subPath = path.join(targetRoot, sub);
        if (!fs.existsSync(subPath)) continue;

        // 1. Disk Count (excluding common ignores)
        const diskFolders = parseInt(execSync(`find "${subPath}" -type d -not -path '*/node_modules*' -not -path '*/.git*' -not -path '*/.conducks*' | wc -l`).toString().trim()) - 1; // -1 for self
        const diskFiles = parseInt(execSync(`find "${subPath}" -type f -not -path '*/node_modules*' -not -path '*/.git*' -not -path '*/.conducks*' | wc -l`).toString().trim());

        // 2. Synapse Count (DuckDB)
        const dbFolders = await registry.infrastructure.persistence.query(
            "SELECT count(*) as count FROM nodes WHERE canonicalKind = 'DIRECTORY' AND filePath LIKE ?",
            [`%/${sub}%`]
        );
        const dbUnits = await registry.infrastructure.persistence.query(
            "SELECT count(*) as count FROM nodes WHERE canonicalKind = 'UNIT' AND filePath LIKE ?",
            [`%/${sub}%`]
        );

        const sFolders = dbFolders[0].count;
        const sUnits = dbUnits[0].count;

        // 3. Fidelity Calculation
        const folderFidelity = diskFolders === 0 ? 100 : Math.min(100, (sFolders / diskFolders) * 100);
        const fileFidelity = diskFiles === 0 ? 100 : Math.min(100, (sUnits / diskFiles) * 100);
        const totalFidelity = (folderFidelity + fileFidelity) / 2;

        console.log(`| ${sub} | ${diskFolders} | ${sFolders} | ${diskFiles} | ${sUnits} | ${totalFidelity.toFixed(1)}% |`);
    }

    console.log("\n🧪 [Conducks Structural Audit] Fidelity Pulse Complete.");
    process.exit(0);
}

runAudit().catch(console.error);
