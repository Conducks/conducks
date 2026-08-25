import { DuckDBInstance } from '@duckdb/node-api';
const inst = await DuckDBInstance.create(process.argv[2], { access_mode: 'READ_ONLY' });
const c = await inst.connect();
const r = await c.runAndReadAll(`SELECT sourceId,targetId,properties,lineNumber FROM edges WHERE type='DEPENDS_ON' AND lower(targetId) LIKE '%specialists%'`);
for (const x of r.getRowObjects()) console.log(String(x.sourceId).split('scraper/').pop(), '->', x.targetId, '|', String(x.properties).slice(0,90));
