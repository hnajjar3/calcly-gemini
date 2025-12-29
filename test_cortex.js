const { ComputeEngine } = require('@cortex-js/compute-engine');

const ce = new ComputeEngine();
const expr = ce.parse("y = x^2 + 1");

console.log("--- Standard toString() ---");
console.log(expr.toString());

console.log("\n--- JSON ---");
console.log(JSON.stringify(expr.json, null, 2));

console.log("\n--- Canonical JSON ---");
console.log(JSON.stringify(expr.canonical.json, null, 2));

console.log("\n--- Compile() Source ---");
try {
    const fn = expr.compile();
    console.log(fn.toString());
} catch (e) {
    console.log("Compile error:", e.message);
}

console.log("\n--- Searching for serialization methods ---");
const proto = Object.getPrototypeOf(expr);
const methods = Object.getOwnPropertyNames(proto);
console.log(methods.join(", "));

console.log("\n--- TypeScript Definition Hints (if any, mocked) ---");
// We can't see .d.ts easily, but let's try strict compile options if valid.
// ce.latexOptions...? 
