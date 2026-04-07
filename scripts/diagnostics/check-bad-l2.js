import duckdb from 'duckdb';
import path from 'node:path';

async function checkRelationships() {
  const dbPath = path.join(process.cwd(), 'data', 'conducks-synapse.db');
  const db = new duckdb.Database(dbPath);
  const conn = db.connect();
  
  const file1 = path.join(process.cwd(), 'src/lib/core/parsing/languages/python/index.ts');
  const file2 = path.join(process.cwd(), 'src/lib/core/parsing/languages/python/extractor.ts');

  console.log(`Checking relationships between:\n1. ${file1}\n2. ${file2}`);

  conn.all(`
    SELECT sourceId, targetId, type, properties 
    FROM edges 
    WHERE (sourceId LIKE '${file1}%' AND targetId LIKE '${file2}%')
       OR (sourceId LIKE '${file2}%' AND targetId LIKE '${file1}%')
  `, (err, rows) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("--- Edges ---");
    console.table(rows);
  });

  conn.all(`
    SELECT id, name, canonicalKind, canonicalRank 
    FROM nodes 
    WHERE id LIKE '${file1}%' OR id LIKE '${file2}%'
    LIMIT 20
  `, (err, rows) => {
    if (err) return;
    console.log("--- Nodes ---");
    console.table(rows);
  });
}

checkRelationships().catch(console.error);
