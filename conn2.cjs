const duckdb=require("duckdb");const db=new duckdb.Database(process.argv[2],duckdb.OPEN_READONLY);const c=db.connect();
const q=(s)=>new Promise(r=>c.all(s,(e,d)=>r(e?[{ERR:e.message}]:d)));
const p=(t,r)=>console.log("\n### "+t+"\n"+JSON.stringify(r));
(async()=>{
p("the 19 isolated STRUCTUREs", (await q(`
  SELECT n.name, n.file FROM nodes n
  WHERE NOT EXISTS (SELECT 1 FROM edges e WHERE e.sourceId=n.id OR e.targetId=n.id) LIMIT 12`)).map(r=>r.name+'  <- '+String(r.file).split('/').slice(-2).join('/')));
p("4 broken parent links", (await q(`
  SELECT n.name, n.parentId FROM nodes n
  WHERE n.parentId IS NOT NULL AND n.parentId NOT IN (SELECT id FROM nodes) LIMIT 6`)).map(r=>r.name+' -> parent missing: '+String(r.parentId).slice(0,60)));
p("do UNITs get MEMBER_OF at all?", await q(`
  SELECT count(*)::INT with_member_of FROM nodes n
  WHERE n.canonicalKind='UNIT' AND EXISTS (SELECT 1 FROM edges e WHERE e.targetId=n.id AND e.type='MEMBER_OF')`));
p("total UNITs", await q("SELECT count(*)::INT c FROM nodes WHERE canonicalKind='UNIT'"));
p("UNITs with a parentId that exists", await q(`
  SELECT count(*)::INT c FROM nodes n WHERE n.canonicalKind='UNIT' AND n.parentId IN (SELECT id FROM nodes)`));
process.exit(0);})()
