/** @format */

import duckdb from 'duckdb';
import path from 'node:path';

const dbPath =
	process.argv[2] || path.join(process.cwd(), 'data', 'conducks-synapse.db');
const db = new duckdb.Database(dbPath);

function all(db, sql, params = []) {
	return new Promise((res, rej) =>
		db.all(sql, ...params, (err, rows) => (err ? rej(err) : res(rows))),
	);
}

async function main() {
	try {
		console.log('\x1b[35m[Conducks] Inspecting Synapse at:\x1b[0m', dbPath);
		
		// 1. Check Pulses
		const pulses = await all(db, 'SELECT * FROM pulses ORDER BY timestamp DESC LIMIT 5');
		console.log('\n\x1b[36m--- LATEST PULSES ---\x1b[0m');
		if (pulses.length === 0) {
			console.log('No pulses found. Graph is likely empty.');
		} else {
			console.table(pulses.map(p => ({
				id: p.id,
				time: new Date(Number(p.timestamp)).toLocaleString(),
				metadata: p.metadata
			})));
		}

		const latestPulse = pulses[0]?.id;
		if (!latestPulse) process.exit(0);

		// 2. Summary Stats
		const nodeCount = await all(db, 'SELECT COUNT(*) as c FROM nodes WHERE pulseId = ?', [latestPulse]);
		const edgeCount = await all(db, 'SELECT COUNT(*) as c FROM edges WHERE pulseId = ?', [latestPulse]);
		
		console.log(`\n\x1b[32mLatest Pulse (${latestPulse}):\x1b[0m`);
		console.log(`- Nodes: ${nodeCount[0].c}`);
		console.log(`- Edges: ${edgeCount[0].c}`);

		// 3. Sample Nodes (Focusing on Hierarchy/Gravity)
		console.log('\n\x1b[36m--- NODE SAMPLE (TOP GRAVITY) ---\x1b[0m');
		const nodes = await all(db, 'SELECT id, kind, name, gravity, isEntryPoint FROM nodes WHERE pulseId = ? ORDER BY gravity DESC LIMIT 10', [latestPulse]);
		console.table(nodes);

		// 4. Sample Edges
		console.log('\n\x1b[36m--- EDGE SAMPLE ---\x1b[0m');
		const edges = await all(db, 'SELECT sourceId, targetId, type, confidence FROM edges WHERE pulseId = ? LIMIT 10', [latestPulse]);
		console.table(edges);

		// 5. Audit L2 Orphans
		console.log('\n\x1b[36m--- L2 ORPHAN AUDIT (::UNIT) ---\x1b[0m');
		const unitNodes = await all(db, "SELECT id FROM nodes WHERE pulseId = ? AND id LIKE '%::UNIT'", [latestPulse]);
		const orphanUnits = [];
		for (const unit of unitNodes) {
			const parents = await all(db, "SELECT sourceId FROM edges WHERE pulseId = ? AND targetId = ? AND type = 'CONTAINS'", [latestPulse, unit.id]);
			if (parents.length === 0) {
				orphanUnits.push(unit.id);
			}
		}
		console.log(`- Total UNIT nodes: ${unitNodes.length}`);
		console.log(`- Orphaned UNIT nodes: ${orphanUnits.length}`);
		if (orphanUnits.length > 0) {
			console.log('\x1b[31m- Sample orphans:\x1b[0m', orphanUnits.slice(0, 5));
		} else {
			console.log('\x1b[32m- Success: All UNIT nodes are parented.\x1b[0m');
		}

	} catch (err) {
		console.error('\n\x1b[31mInspect failed:\x1b[0m', err.message);
	} finally {
		process.exit(0);
	}
}

main();
