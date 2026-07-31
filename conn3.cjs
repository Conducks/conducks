const duckdb=require("duckdb");const db=new duckdb.Database(process.argv[2],duckdb.OPEN_READONLY);const c=db.connect();
const q=(s)=>new Promise(r=>c.all(s,(e,d)=>r(e?[{ERR:e.message}]:d)));
const p=(t,r)=>console.log("\n### "+t+"\n"+JSON.stringify(r));
(async()=>{
p("containment: parentId present vs MEMBER_OF edge present, by kind", await q(`
  SELECT n.canonicalKind k,
         count(*)::INT total,
         sum(CASE WHEN n.parentId IS NOT NULL THEN 1 ELSE 0 END)::INT has_parent_col,
         sum(CASE WHEN EXISTS (SELECT 1 FROM edges e WHERE e.targetId=n.id AND e.type='MEMBER_OF') THEN 1 ELSE 0 END)::INT has_member_edge
  FROM nodes n GROUP BY 1 ORDER BY 2 DESC`));
p("MEMBER_OF edges whose direction is child->parent or parent->child?", await q(`
  SELECT s.canonicalKind src_kind, t.canonicalKind tgt_kind, count(*)::INT c
  FROM edges e JOIN nodes s ON e.sourceId=s.id JOIN nodes t ON e.targetId=t.id
  WHERE e.type='MEMBER_OF' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 6`));
process.exit(0);})()
