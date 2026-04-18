import assert from "node:assert/strict";
import test from "node:test";

import { mergeEngineOptions } from "./schemas.js";

test("mergeEngineOptions folds legacy model", () => {
  const out = mergeEngineOptions({
    engineId: "claude",
    message: "hi",
    model: "opus",
  });
  assert.deepEqual(out, { model: "opus" });
});

test("mergeEngineOptions prefers engineOptions.model over legacy", () => {
  const out = mergeEngineOptions({
    engineId: "claude",
    message: "hi",
    model: "opus",
    engineOptions: { model: "sonnet" },
  });
  assert.deepEqual(out, { model: "sonnet" });
});

test("mergeEngineOptions returns undefined when empty", () => {
  assert.equal(
    mergeEngineOptions({ engineId: "claude", message: "hi" }),
    undefined,
  );
});
