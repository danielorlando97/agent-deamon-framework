import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAgentModelList,
  parseOpencodeModelList,
  parsePiModelList,
} from "./list-models.js";

test("parseAgentModelList reads id — label lines", () => {
  const raw = "Available models\n\nauto - Auto  (current)\ngpt-5 - GPT-5\n";
  const m = parseAgentModelList(raw);
  assert.deepEqual(m[0], { id: "auto", label: "Auto" });
  assert.equal(m[1]?.id, "gpt-5");
});

test("parseOpencodeModelList keeps provider/model ids", () => {
  const m = parseOpencodeModelList("opencode/gpt-5\n\n# skip\n");
  assert.deepEqual(m, [{ id: "opencode/gpt-5" }]);
});

test("parsePiModelList skips header row", () => {
  const raw =
    "provider            model\n" +
    "google-gemini-cli   gemini-2.5-flash\n";
  const m = parsePiModelList(raw);
  assert.deepEqual(m, [
    { id: "google-gemini-cli/gemini-2.5-flash", label: "gemini-2.5-flash" },
  ]);
});
