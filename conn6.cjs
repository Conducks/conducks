const duckdb=require("duckdb");const db=new duckdb.Database(process.argv[2],duckdb.OPEN_READONLY);const c=db.connect();
const q=(s)=>new Promise(r=>c.all(s,(e,d)=>r(e?[{ERR:e.message}]:d)));
const p=(t,r)=>console.log("\n### "+t+"\n"+JSON.stringify(r));
(async()=>{
p("nodes whose parentId IS THEIR OWN id (self-parent)", await q(`
  SELECT canonicalKind k, count(*)::INT c FROM nodes WHERE parentId = id GROUP BY 1 ORDER BY 2 DESC`));
p("example", (await q(`SELECT id, parentId FROM nodes WHERE parentId = id LIMIT 2`)).map(r=>'id     '+r.id+'\n     parent '+r.parentId));
p("nodes whose parent chain never reaches a container (cluster fallback)", await q(`
  SELECT count(*)::INT c FROM nodes WHERE parentId = id`));
process.exit(0);})()
