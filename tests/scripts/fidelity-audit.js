import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { registry } from '../../build/src/registry/index.js';

const buildRoot = path.join(process.cwd(), "build/src");

async function runAudit() {
    const { DuckDbPersistence } = await import(path.join(buildRoot, "lib/core/persistence/persistence.js"));
    const targetRoot = path.join(process.cwd(), "../archive/TargetedCV");
    const persistence = new DuckDbPersistence(targetRoot);
    
    console.log("🏺 [Conducks Structural Audit] Initializing Fidelity Pulse...");
    
    // Get submodules (filtering out system folders)
    const submodules = fs.readdirSync(targetRoot)
        .filter(f => fs.statSync(path.join(targetRoot, f)).isDirectory() && !f.startsWith(".") && f !== "node_modules");

    console.log(`\n| Submodule | Disk Folders | Synapse Folders | Disk Files | Synapse Units | Fidelity |`);
    console.log(`| :--- | :--- | :--- | :--- | :--- | :--- |`);

    for (const sub of submodules) {
        const subPath = path.resolve(targetRoot, sub);
        const subLower = sub.toLowerCase();

        // 1. Disk Count (excluding hidden/.conducks/node_modules)
        const diskFoldersStr = execSync(`find "${subPath}" -type d -not -path '*/.*' -not -path '*/node_modules*' | wc -l`).toString().trim();
        const diskFolders = Math.max(0, parseInt(diskFoldersStr) - 1);
        
        const diskFilesStr = execSync(`find "${subPath}" -type f -not -path '*/.*' -not -path '*/node_modules*' | wc -l`).toString().trim();
        const diskFiles = parseInt(diskFilesStr);

        // 2. Synapse Count (DuckDB) - Use ILIKE for case-insensitive or lowercase
        const dbFolders = await persistence.query(
            "SELECT count(*) as count FROM nodes WHERE canonicalKind = 'DIRECTORY' AND id LIKE ?",
            [`%/${subLower}%`]
        );
        const dbUnits = await persistence.query(
            "SELECT count(*) as count FROM nodes WHERE canonicalKind = 'UNIT' AND file LIKE ?",
            [`%/${subLower}/%`]
        );

        // Convert BigInt to Number safely
        const sFolders = Number(dbFolders[0]?.count || 0n);
        const sUnits = Number(dbUnits[0]?.count || 0n);

        // 3. Fidelity Calculation
        const folderRatio = diskFolders === 0 ? 1 : Math.min(1, sFolders / diskFolders);
        const fileRatio = diskFiles === 0 ? 1 : Math.min(1, sUnits / diskFiles);
        const totalFidelity = ((folderRatio + fileRatio) / 2) * 100;

        console.log(`| ${sub} | ${diskFolders} | ${sFolders} | ${diskFiles} | ${sUnits} | ${totalFidelity.toFixed(1)}% |`);
    }

    console.log("\n🧪 [Conducks Structural Audit] Fidelity Pulse Complete.");
    await persistence.close();
}

runAudit().catch(console.error);
