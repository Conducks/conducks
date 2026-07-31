const duckdb=require("duckdb");const db=new duckdb.Database(process.argv[2],duckdb.OPEN_READONLY);const c=db.connect();
const q=(s)=>new Promise(r=>c.all(s,(e,d)=>r(e?[{ERR:e.message}]:d)));
const p=(t,r)=>console.log("\n### "+t+"\n"+JSON.stringify(r));
(async()=>{
p("does each node have an OUTGOING MEMBER_OF (its own containment edge)?", await q(`
  SELECT n.canonicalKind k, count(*)::INT total,
         sum(CASE WHEN n.parentId IS NOT NULL THEN 1 ELSE 0 END)::INT has_parent_col,
         sum(CASE WHEN EXISTS (SELECT 1 FROM edges e WHERE e.sourceId=n.id AND e.type='MEMBER_OF') THEN 1 ELSE 0 END)::INT has_own_edge
  FROM nodes n GROUP BY 1 ORDER BY 2 DESC`));
p("nodes with parentId but NO containment edge", await q(`
  SELECT count(*)::INT c FROM nodes n WHERE n.parentId IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.sourceId=n.id AND e.type='MEMBER_OF')`));
p("do the MEMBER_OF edges AGREE with parentId?", await q(`
  SELECT sum(CASE WHEN e.targetId = n.parentId THEN 1 ELSE 0 END)::INT agree,
         sum(CASE WHEN e.targetId <> n.parentId THEN 1 ELSE 0 END)::INT disagree
  FROM edges e JOIN nodes n ON e.sourceId = n.id WHERE e.type='MEMBER_OF'`));
process.exit(0);})()
