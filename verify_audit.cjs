const { registry, initializeRegistry } = require('./build/src/registry/index.js');

async function test() {
    console.log('--- Initializing Registry (v0.8.0) ---');
    await initializeRegistry(true);
    
    console.log('\n--- Running Structural Audit ---');
    const audit = await registry.audit.audit();
    
    console.log(`Success: ${audit.success}`);
    console.log(`Violations Found: ${audit.violations.length}`);
    
    if (audit.violations.length > 0) {
        console.log('\n--- First 3 Violations (Structured) ---');
        console.log(JSON.stringify(audit.violations.slice(0, 3), null, 2));
    }
}

test().catch(console.error);
