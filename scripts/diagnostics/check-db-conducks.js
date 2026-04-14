/** @format */

import duckdb from 'duckdb';
import path from 'node:path';

async function runChecks() {
	const dbPath = path.join(process.cwd(), '.conducks', 'conducks-synapse.db');
	console.log(`Opening DB at: ${dbPath}`);
	const db = new duckdb.Database(dbPath);

	const all = (sql, params = []) =>
		new Promise((res, rej) =>
			db.all(sql, ...params, (err, rows) => (err ? rej(err) : res(rows))),
		);

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
