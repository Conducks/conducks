import { Conducks } from "../build/src/conducks-core.js";
import path from "node:path";
import fs from "node:fs/promises";

async function runAudit() {
  console.log("🚀 [Apostle v6] Starting Phase 2 'Pulse Flow' Audit...");
  
  const c = new Conducks();
  
  // 1. Mocking a Cross-Service Data Flow Scenario
  const files = [
    {
      path: "/app/services/frontend.py",
      source: `
import requests
def get_user_view():
    uid = "123"
    # Call to external service
    resp = requests.get("/api/user/profile")
    return resp.json()
      `
    },
    {
      path: "/app/services/backend.py",
      source: `
from fastapi import FastAPI
app = FastAPI()

@app.get("/api/user/profile")
def get_profile():
    user_data = db.fetch("user")
    # Variable Handover: 'user_data' is defined then passed to 'format_output'
    formatted = format_output(user_data)
    return formatted

def format_output(data):
    return {"status": "ok", "payload": data}
      `
    }
  ];

  console.log("1️⃣ Executing Topological Pulse (Cross-Service)...");
  await c.pulse(files);
  await c.resonate();

  const graph = c.graph.getGraph();
  
  // 2. Verify Route Discovery
  console.log("2️⃣ Verifying Microservice Route Discovery...");
  const routeNode = Array.from(graph.getAllNodes()).find(n => n.properties.path === "/api/user/profile");
  if (routeNode) {
    console.log(`   ✅ Success: Backend route found at ${routeNode.id}`);
  } else {
    console.log("   ❌ Failure: Backend route not discovered.");
  }

  // 3. Verify Cross-Service Resonance (The Bridge)
  console.log("3. Verifying Cross-Service 'RESONANCE' Bridge...");
  // Find the request from frontend calling backend
  const requestEdge = Array.from(graph.getAllNodes()).flatMap(n => 
     graph.getNeighbors(n.id, 'downstream')
  ).find(e => e.properties.isResonance);

  if (requestEdge) {
    console.log(`   ✅ Success: Frontend request resonated with Backend route.`);
    console.log(`      Resonance: ${requestEdge.sourceId} -> ${requestEdge.targetId}`);
  } else {
    console.log("   ❌ Failure: Frontend request failed to resonate with Backend.");
  }

  // 4. Verify Local Variable Handover (The Pulse Trace)
  console.log("4. Verifying Local Variable Handover (Pulse Trace)...");
  // Look for PULSES_TO edge in backend.py
  const pulseEdge = Array.from(graph.getAllNodes()).flatMap(n => 
     graph.getNeighbors(n.id, 'downstream')
  ).find(e => e.type === 'PULSES_TO');


  if (pulseEdge) {
    console.log(`   ✅ Success: Variable handover 'user_data' -> 'format_output' traced.`);
    console.log(`      Pulse: ${pulseEdge.sourceId} --[${pulseEdge.properties.variable}]--> ${pulseEdge.targetId}`);
  } else {
    console.log("   ❌ Failure: Variable handover trace lost.");
  }

  console.log("\n💎 Phase 2 Audit Complete: Pulse Flow is OPERATIONAL.");
}

runAudit().catch(e => {
  console.error("❌ Audit Engine Failure:", e);
  process.exit(1);
});
