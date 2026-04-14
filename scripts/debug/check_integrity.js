import duckdb from 'duckdb';
import path from 'path';

const dbPath = path.resolve('../test-projects/scraper/.conducks/conducks-synapse.db');
const db = new duckdb.Database(dbPath);

console.log("Analyzing graph integrity for hidden bugs...");

db.all(`
  SELECT canonicalKind, COUNT(*) as count 
  FROM nodes 
  WHERE parentId IS NULL AND canonicalKind NOT IN ('REPOSITORY', 'ECOSYSTEM', 'DIRECTORY', 'UNIT')
  GROUP BY canonicalKind
`, (err, res) => {
  if (err) console.error(err);
  else {
    console.log("Orphaned Nodes (No Parent) by Kind:");
    console.table(res);
  }
});

db.all(`
  SELECT type, COUNT(*) as count 
  FROM edges 
  GROUP BY type
`, (err, res) => {
  if (err) console.error(err);
  else {
    console.log("Edge Diversity:");
    console.table(res);
  }
});
