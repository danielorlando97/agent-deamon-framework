import assert from "node:assert/strict";
import test from "node:test";

process.env.AGENT_DAEMON_LOG_LEVEL = "error";

const {
  engineIdToEnvSuffix,
  engineIntegrationMeta,
  parseArgsJson,
} = await import("./engine-env.js");

test("engineIdToEnvSuffix maps cursor_agent to CURSOR_AGENT", () => {
  assert.equal(engineIdToEnvSuffix("cursor_agent"), "CURSOR_AGENT");
});

test("engineIntegrationMeta exposes argv key and suffix", () => {
  const m = engineIntegrationMeta("cursor_agent");
  assert.equal(m.engineIdEnvSuffix, "CURSOR_AGENT");
  assert.equal(m.argvJsonEnvKey, "AGENT_ENGINE_CURSOR_AGENT_ARGS_JSON");
});

test("parseArgsJson accepts string array", () => {
  const raw = JSON.stringify(["--model", "opus"]);
  assert.deepEqual(parseArgsJson(raw, "claude"), ["--model", "opus"]);
});

test("parseArgsJson rejects non-array", () => {
  assert.equal(parseArgsJson('{"x":1}', "claude"), null);
});
