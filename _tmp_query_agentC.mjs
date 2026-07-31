import duckdb from 'duckdb';

const dbPath = process.argv[2];
const sql = process.argv[3];

const db = new duckdb.Database(dbPath, { access_mode: 'READ_ONLY' });

function all(db, sql) {
  return new Promise((res, rej) =>
    db.all(sql, (err, rows) => (err ? rej(err) : res(rows))),
  );
}

async function main() {
  try {
    const rows = await all(db, sql);
    console.log(JSON.stringify(rows, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  } catch (err) {
    console.error('QUERY FAILED:', err.message);
  } finally {
    process.exit(0);
  }
}

main();
