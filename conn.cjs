const duckdb=require("duckdb");const db=new duckdb.Database(process.argv[2],duckdb.OPEN_READONLY);const c=db.connect();
const q=(s)=>new Promise(r=>c.all(s,(e,d)=>r(e?[{ERR:e.message}]:d)));
const p=(t,r)=>console.log("\n### "+t+"\n"+JSON.stringify(r));
(async()=>{
p("totals", await q("SELECT (SELECT count(*) FROM nodes)::INT nodes,(SELECT count(*) FROM edges)::INT edges"));
p("nodes with NO edge at all (isolated)", await q(`
  SELECT count(*)::INT c FROM nodes n
  WHERE NOT EXISTS (SELECT 1 FROM edges e WHERE e.sourceId=n.id OR e.targetId=n.id)`));
p("isolated by kind", await q(`
  SELECT n.canonicalKind k, count(*)::INT c FROM nodes n
  WHERE NOT EXISTS (SELECT 1 FROM edges e WHERE e.sourceId=n.id OR e.targetId=n.id)
  GROUP BY 1 ORDER BY 2 DESC`));
p("no INCOMING edge (unreferenced)", await q(`
  SELECT n.canonicalKind k, count(*)::INT c FROM nodes n
  WHERE NOT EXISTS (SELECT 1 FROM edges e WHERE e.targetId=n.id)
  GROUP BY 1 ORDER BY 2 DESC`));
p("no OUTGOING edge (leaves)", await q(`
  SELECT count(*)::INT c FROM nodes n
  WHERE NOT EXISTS (SELECT 1 FROM edges e WHERE e.sourceId=n.id)`));
p("nodes missing a parent (containment break)", await q(`
  SELECT count(*)::INT c FROM nodes n
  WHERE n.parentId IS NOT NULL AND n.parentId NOT IN (SELECT id FROM nodes)`));
p("nodes with NO parentId at all", await q(`
  SELECT canonicalKind k, count(*)::INT c FROM nodes WHERE parentId IS NULL GROUP BY 1 ORDER BY 2 DESC`));
process.exit(0);})()
