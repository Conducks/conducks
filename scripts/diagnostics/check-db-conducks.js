/** @format */

import { openVault } from '../../tools/lib/vault.mjs';
import path from 'node:path';

async function runChecks() {
	const dbPath = path.join(process.cwd(), '.conducks', 'conducks-synapse.db');
	console.log(`Opening DB at: ${dbPath}`);
	const db = await openVault(dbPath);

	const all = (sql, params = []) => db.all(sql, params);

	try {
		const total = await all('SELECT COUNT(*) as count FROM nodes');
		const tsCount = await all(
			"SELECT COUNT(*) as count FROM nodes WHERE file LIKE '%.ts%' OR file LIKE '%.tsx%'",
		);
		const recentPulses = await all(
			'SELECT id, timestamp, nodeCount, edgeCount FROM pulses ORDER BY timestamp DESC LIMIT 5',
		);
		const sampleTs = await all(
			"SELECT id, name, canonicalKind, file, unitId FROM nodes WHERE file LIKE '%.ts%' OR file LIKE '%.tsx%' ORDER BY file LIMIT 20",
		);

		console.log('Total nodes:', total[0]?.count ?? 0);
		console.log('TypeScript/TSX nodes:', tsCount[0]?.count ?? 0);
		console.log('Recent pulses:');
		console.table(recentPulses);
		console.log('Sample TypeScript nodes:');
		console.table(sampleTs);
	} catch (e) {
		console.error('Error querying DB:', e);
	}
}

runChecks();
