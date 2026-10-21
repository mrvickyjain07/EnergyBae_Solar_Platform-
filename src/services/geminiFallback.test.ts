// Run: npx tsx src/services/geminiFallback.test.ts
// generateWithGeminiFallback: a 503 "high demand" on GEMINI_MODEL must fall
// through to GEMINI_FALLBACK_MODEL instead of failing the scan; a
// non-transient error must NOT be retried on another model; when everything
// is overloaded the caller gets ExtractionUnavailableError (→ manual entry).
// No network: the callback stands in for the Gemini SDK call.
import assert from "node:assert/strict";

process.env.GEMINI_API_KEY ||= "test-key-test-key-test-key-123456";
delete process.env.GEMINI_API_KEY_BACKUP; // the configuration that failed in production
const { generateWithGeminiFallback, ExtractionUnavailableError, GEMINI_MODEL, GEMINI_FALLBACK_MODEL, withTimeout, isTransientError } =
  await import("./geminiExtraction");

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, label);
  passed++;
  console.log(`  ok — ${label}`);
}

const overloaded = () => Object.assign(new Error(JSON.stringify({ error: { code: 503, message: "This model is currently experiencing high demand.", status: "UNAVAILABLE" } })), { status: 503 });

check("fallback model differs from primary", GEMINI_FALLBACK_MODEL !== GEMINI_MODEL, true);

// 1. Primary model overloaded → fallback model answers.
const seen: string[] = [];
const result = await generateWithGeminiFallback("t1", async (_ai, model) => {
  seen.push(model);
  if (model === GEMINI_MODEL) throw overloaded();
  return "ok";
});
check("503 on primary falls back and succeeds", result, "ok");
check("tried primary twice, then fallback once", seen, [GEMINI_MODEL, GEMINI_MODEL, GEMINI_FALLBACK_MODEL]);

// 2. Non-transient error (e.g. bad request) is thrown at once, no model hopping.
const seen2: string[] = [];
await assert.rejects(
  generateWithGeminiFallback("t2", async (_ai, model) => { seen2.push(model); throw Object.assign(new Error("400 invalid argument"), { status: 400 }); }),
  /invalid argument/,
);
check("non-transient error not retried elsewhere", seen2, [GEMINI_MODEL]);

// 3. Everything overloaded → ExtractionUnavailableError (UI offers manual entry).
await assert.rejects(
  generateWithGeminiFallback("t3", async () => { throw overloaded(); }),
  (e: unknown) => e instanceof ExtractionUnavailableError,
);
check("all overloaded → ExtractionUnavailableError", true, true);

console.log(`\n${passed} passed`);
