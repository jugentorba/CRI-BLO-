import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Runtime tests exercise the real TypeScript source with mocked HTTP transports.
// No real credentials, Google API calls, or user data are needed for these checks.
const source = readFileSync(new URL("../src/lib/ai/independent.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
});
const errors = (compiled.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, {
  getCanonicalFileName: (s) => s, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n",
}));

let native = false;
let status = 200;
let data = { choices: [{ message: { content: "OK" } }] };
let sent = null;
const fakeCapacitor = {
  Capacitor: { isNativePlatform: () => native },
  CapacitorHttp: {
    post: async (payload) => {
      sent = { transport: "native", url: payload.url, headers: payload.headers, body: payload.data };
      return { status, data };
    },
  },
};
const output = { exports: {} };
const sandbox = {
  exports: output.exports,
  require: (name) => {
    assert.equal(name, "@capacitor/core");
    return fakeCapacitor;
  },
  fetch: async (url, init) => {
    sent = { transport: "web", url, headers: init.headers, body: JSON.parse(init.body) };
    return { status, json: async () => data };
  },
  setTimeout, console,
};
vm.runInNewContext(compiled.outputText, sandbox, { filename: "independent.cjs" });
const ai = output.exports;
const config = (model) => ai.buildAiConfig({ aiProvider: "gemini", aiApiKey: "TEST_ONLY_FAKE_KEY", aiModel: model });
assert.equal(ai.GEMINI_MODEL_OPTIONS.length, 5);
assert.equal(ai.GEMINI_MODEL_OPTIONS[0].id, "gemini-3.5-flash-lite");
assert.equal(config("gemini-3.8-flash").model, "gemini-3.8-flash", "3.8 must not be silently downgraded");
assert.equal(config("gemini-3.7-flash").model, "gemini-3.7-flash");
assert.equal(ai.getGeminiReasoningEffort("gemini-3.7-flash", true), "low");
assert.equal(ai.getGeminiReasoningEffort("gemini-3.8-flash", true), "low");
assert.equal(ai.getGeminiReasoningEffort("gemini-3.5-flash-lite", true), "minimal");
assert.equal(ai.getGeminiReasoningEffort("unrecognized-model", true), undefined);

for (const model of ["gemini-3.5-flash-lite", "gemini-3.7-flash", "gemini-3.8-flash"]) {
  native = false;
  status = 200;
  data = { choices: [{ message: { content: "OK" } }] };
  assert.equal(await ai.callIndependentAi(config(model), "Please say OK", { fast: true, maxTokens: 220 }), "OK");
  assert.equal(sent.transport, "web");
  assert.equal(sent.body.model, model);
  assert.equal(sent.body.reasoning_effort, model.includes("3.5") ? "minimal" : "low");
  assert.equal(sent.body.max_tokens, 220);
  assert.equal(sent.headers.Authorization, "Bearer TEST_ONLY_FAKE_KEY");
}

native = true;
await ai.testAiConnection(config("gemini-3.7-flash"));
assert.equal(sent.transport, "native");
assert.equal(sent.body.model, "gemini-3.7-flash");
assert.equal(sent.body.reasoning_effort, "low");
assert.ok(sent.body.max_tokens >= 1024, "connection test needs thinking token headroom");

native = false;
status = 400;
data = { error: { message: "Invalid reasoning level for selected model" } };
await assert.rejects(
  ai.testAiConnection(config("gemini-3.7-flash")),
  /Google Gemini : Invalid reasoning level for selected model/,
  "Google's HTTP 400 detail must be visible to the user",
);

// Confirm the settings page exposes a real selector and a description for each entry.
const settings = readFileSync(new URL("../src/routes/parametres.tsx", import.meta.url), "utf8");
assert.match(settings, /Choisir un modèle Gemini/);
assert.match(settings, /GEMINI_MODEL_OPTIONS\.map/);
assert.match(settings, /selectedGeminiOption\.usage/);
console.log("CRI BLO Gemini model selection and transport tests passed.");
