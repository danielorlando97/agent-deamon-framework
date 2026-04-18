import { config } from "../config.js";
import { subprocessEngines } from "./adaptadores/subprocess-engines.js";
import { engineIntegrationMeta } from "./engine-env.js";
import type { EngineDefinition, EngineInfo } from "./types.js";

function allEngines(): EngineDefinition[] {
  return subprocessEngines(config.chatTimeoutMs);
}

export function listEngineInfos(): EngineInfo[] {
  return allEngines().map((e) => ({
    ...e.info,
    integration: engineIntegrationMeta(e.info.id),
  }));
}

export function getEngine(id: string): EngineDefinition | undefined {
  return allEngines().find((e) => e.info.id === id);
}
