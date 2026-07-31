const duckdb=require("duckdb");const db=new duckdb.Database(process.argv[2],duckdb.OPEN_READONLY);const c=db.connect();
const q=(s)=>new Promise(r=>c.all(s,(e,d)=>r(e?[{ERR:e.message}]:d)));
const p=(t,r)=>console.log("\n### "+t+"\n"+JSON.stringify(r));
(async()=>{
p("disagreement by kind", await q(`
  SELECT n.canonicalKind k, count(*)::INT c
  FROM edges e JOIN nodes n ON e.sourceId=n.id
  WHERE e.type='MEMBER_OF' AND e.targetId <> n.parentId GROUP BY 1 ORDER BY 2 DESC`));
p("does the node have MULTIPLE MEMBER_OF edges?", await q(`
  SELECT cnt, count(*)::INT nodes FROM (
    SELECT e.sourceId, count(*)::INT cnt FROM edges e WHERE e.type='MEMBER_OF' GROUP BY 1
  ) x GROUP BY 1 ORDER BY 1`));
p("sample disagreements", (await q(`
  SELECT n.name, n.canonicalKind k, e.targetId edge_parent, n.parentId col_parent
  FROM edges e JOIN nodes n ON e.sourceId=n.id
  WHERE e.type='MEMBER_OF' AND e.targetId <> n.parentId LIMIT 5`)).map(r=>
    `${r.k} ${r.name}\n     edge -> ${String(r.edge_parent).split('/').pop()}\n     col  -> ${String(r.col_parent).split('/').pop()}`));
process.exit(0);})()
