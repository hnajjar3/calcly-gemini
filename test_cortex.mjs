import { ComputeEngine } from '@cortex-js/compute-engine';

const ce = new ComputeEngine();
const expr = ce.parse("y = x^2 + 1");

console.log("--- Standard toString() ---");
console.log(expr.toString());

console.log("\n--- JSON ---");
console.log(JSON.stringify(expr.json, null, 2));

console.log("\n--- Canonical JSON ---");
console.log(JSON.stringify(expr.canonical.json, null, 2));

console.log("\n--- Compile() Source Detailed ---");
try {
    const fn = expr.compile();
    console.log(fn.toString());
} catch (e) {
    console.log("Compile error:", e.message);
}

// Investigate BoxedExpression prototype
console.log("\n--- BoxedExpression Methods ---");
// We access the prototype of the expression instance
let proto = Object.getPrototypeOf(expr);
while (proto && proto.constructor.name !== 'Object') {
    console.log(`[${proto.constructor.name}] Methods:`, Object.getOwnPropertyNames(proto).join(', '));
    proto = Object.getPrototypeOf(proto);
}

// Check if serialization options exist
console.log("\n--- Evaluate() ---");
try {
    // Maybe evaluate converts it?
    console.log(expr.evaluate().toString());
} catch (e) { }
