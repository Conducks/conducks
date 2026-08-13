const path = require('node:path');

async function checkPulseDrift() {
  const dbPath = path.resolve(".conducks/conducks-synapse.db");
  const { openVault } = await import('../../tools/lib/vault.mjs');
  const db = await openVault(dbPath);
  const con = db;
  const query = (sql) => con.all(sql);
  
  try {
    const pulses = await query("SELECT id, timestamp FROM pulses ORDER BY timestamp DESC LIMIT 5");
    console.log("--- 📡 Pulse Layer Evolution (Last 5) ---");
    
    for (const pulse of pulses) {
      console.log(`\nPulse: ${pulse.id} (${new Date(Number(pulse.timestamp)).toLocaleString()})`);
      const layers = await query(`
        SELECT canonicalKind, count(*) as count 
        FROM nodes 
        WHERE pulseId = '${pulse.id}' 
        GROUP BY canonicalKind
      `);
      console.table(layers);
    }
  } catch (err) {
    console.error(err);
  } finally {
    db.close();
  }
}

checkPulseDrift();
