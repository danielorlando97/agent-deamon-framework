import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { CwdBrowseModal } from "./CwdBrowseModal";

type EngineInfo = {
  id: string;
  label: string;
  description: string;
  available: boolean;
  integration?: {
    argvJsonEnvKey: string;
    engineIdEnvSuffix: string;
  };
};

type EngineModelsPayload = {
  engineId: string;
  available: boolean;
  source: "cli" | "static";
  models: { id: string; label?: string }[];
  error?: string;
  note?: string;
};

type RunOptionsForm = {
  permissionMode: string;
  executionMode: string;
  approvalMode: string;
  continueSession: boolean;
  addDirsCsv: string;
  cwd: string;
  sessionId: string;
  streamPartial: boolean;
};

const defaultRunOptions: RunOptionsForm = {
  permissionMode: "",
  executionMode: "",
  approvalMode: "",
  continueSession: false,
  addDirsCsv: "",
  cwd: "",
  sessionId: "",
  streamPartial: false,
};

type ToolTraceEntry = {
  name: string;
  detail: string;
  ok?: boolean;
};

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "thinking_done" }
  | {
      type: "tool";
      phase: "start" | "end";
      name: string;
      detail?: string;
      ok?: boolean;
    }
  | { type: "log"; stream: "stdout" | "stderr"; message: string }
  | { type: "done" }
  | { type: "error"; message: string };

type ChatRow =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      thinking?: string;
      tools?: ToolTraceEntry[];
    }
  | { role: "log"; text: string }
  | { role: "error"; text: string };

function parseSseBuffer(buf: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = [];
  const parts = buf.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const block of parts) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      try {
        events.push(JSON.parse(raw) as StreamEvent);
      } catch {
        /* skip */
      }
    }
  }
  return { events, rest };
}

function iconSvgProps() {
  return {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
}

function IconChat() {
  return (
    <svg {...iconSvgProps()}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg {...iconSvgProps()}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  );
}

function IconPaperclip() {
  return (
    <svg {...iconSvgProps()}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg {...iconSvgProps()} strokeWidth={2.1}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22 11 13 2 9 22 2z" />
    </svg>
  );
}

function IconPanels() {
  return (
    <svg {...iconSvgProps()} strokeWidth={2}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    setMatches(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function App() {
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [modelCatalog, setModelCatalog] = useState<EngineModelsPayload[]>([]);
  const [modelsErr, setModelsErr] = useState<string | null>(null);
  const [modelByEngine, setModelByEngine] = useState<Record<string, string>>(
    {},
  );
  const [runFormByEngine, setRunFormByEngine] = useState<
    Record<string, RunOptionsForm>
  >({});
  const [engineId, setEngineId] = useState<string>("");
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Idle");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isMobileLayout = useMediaQuery("(max-width: 900px)");
  const [enginesPanelOpen, setEnginesPanelOpen] = useState(false);
  const [cwdPickerOpen, setCwdPickerOpen] = useState(false);

  useEffect(() => {
    if (!isMobileLayout) setEnginesPanelOpen(false);
  }, [isMobileLayout]);

  useEffect(() => {
    if (!enginesPanelOpen || !isMobileLayout) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setEnginesPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enginesPanelOpen, isMobileLayout]);

  const selected = useMemo(
    () => engines.find((e) => e.id === engineId),
    [engines, engineId],
  );

  const onlineCount = useMemo(
    () => engines.filter((e) => e.available).length,
    [engines],
  );

  const modelMeta = useMemo(
    () => modelCatalog.find((e) => e.engineId === engineId),
    [modelCatalog, engineId],
  );

  const catalogModelIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of modelMeta?.models ?? []) set.add(m.id);
    return set;
  }, [modelMeta?.models]);

  const rawModelForSelected = modelByEngine[selected?.id ?? ""] ?? "";
  const modelSelectValue =
    rawModelForSelected === "" || catalogModelIds.has(rawModelForSelected)
      ? rawModelForSelected
      : "__custom__";

  const runForm = useMemo(
    () => runFormByEngine[engineId] ?? defaultRunOptions,
    [runFormByEngine, engineId],
  );

  const patchRunForm = useCallback(
    (patch: Partial<RunOptionsForm>) => {
      setRunFormByEngine((prev) => ({
        ...prev,
        [engineId]: { ...defaultRunOptions, ...prev[engineId], ...patch },
      }));
    },
    [engineId],
  );

  const refreshModels = useCallback(async () => {
    setModelsErr(null);
    try {
      const r = await fetch("/api/engine-models");
      if (!r.ok) throw new Error(`engine-models ${r.status}`);
      const j = (await r.json()) as { engines: EngineModelsPayload[] };
      setModelCatalog(j.engines ?? []);
    } catch (e) {
      setModelsErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refreshEngines = useCallback(async () => {
    setLoadErr(null);
    try {
      const r = await fetch("/api/engines");
      if (!r.ok) throw new Error(`engines ${r.status}`);
      const j = (await r.json()) as { engines: EngineInfo[] };
      const list = j.engines ?? [];
      setEngines(list);
      setEngineId((cur) => {
        if (list.some((e) => e.id === cur)) return cur;
        return list.find((e) => e.available)?.id ?? list[0]?.id ?? cur;
      });
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refreshEngines();
  }, [refreshEngines]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [rows, busy]);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !selected?.available) return;
    stop();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setStatus("Streaming");
    setRows((prev) => [...prev, { role: "user", text }]);
    setInput("");

    let assistantBuf = "";
    let thinkingAcc = "";
    const toolsAcc: ToolTraceEntry[] = [];

    const dropIfEmptyAssistant = (p: ChatRow[]): ChatRow[] => {
      const last = p[p.length - 1];
      if (
        last?.role === "assistant" &&
        !(last.text ?? "").trim() &&
        !(last.thinking ?? "").trim() &&
        !(last.tools?.length)
      ) {
        return p.slice(0, -1);
      }
      return p;
    };

    const patchAssistantMeta = () => {
      setRows((prev) => {
        const last = prev[prev.length - 1];
        const meta = {
          thinking: thinkingAcc,
          tools: [...toolsAcc],
        };
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, ...meta }];
        }
        if (thinkingAcc || toolsAcc.length) {
          return [...prev, { role: "assistant" as const, text: "", ...meta }];
        }
        return prev;
      });
    };

    const flushAssistant = () => {
      if (!assistantBuf) return;
      const chunk = assistantBuf;
      assistantBuf = "";
      const meta = { thinking: thinkingAcc, tools: [...toolsAcc] };
      setRows((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return [
            ...prev.slice(0, -1),
            { ...last, text: last.text + chunk, ...meta },
          ];
        }
        return [...prev, { role: "assistant", text: chunk, ...meta }];
      });
    };

    try {
      const model = (modelByEngine[engineId] ?? "").trim();
      const rf = runFormByEngine[engineId] ?? defaultRunOptions;
      const engineOptions: Record<string, unknown> = {};
      if (model) engineOptions.model = model;
      if (rf.cwd.trim()) engineOptions.cwd = rf.cwd.trim();
      const dirs = rf.addDirsCsv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (dirs.length) engineOptions.addDirs = dirs;
      if (engineId === "claude" && rf.permissionMode) {
        engineOptions.permissionMode = rf.permissionMode;
      }
      if (engineId === "cursor_agent" && rf.executionMode) {
        engineOptions.executionMode = rf.executionMode;
      }
      if (engineId === "qwen" && rf.approvalMode) {
        engineOptions.approvalMode = rf.approvalMode;
      }
      if (rf.continueSession) engineOptions.continueSession = true;
      if (rf.sessionId.trim()) engineOptions.sessionId = rf.sessionId.trim();
      if (engineId === "cursor_agent" && !rf.streamPartial) {
        engineOptions.streamPartialOutput = false;
      }
      const body: Record<string, unknown> = { engineId, message: text };
      if (Object.keys(engineOptions).length) body.engineOptions = engineOptions;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        const msg =
          typeof j.error === "string"
            ? j.error
            : JSON.stringify(j.error ?? res.statusText);
        setRows((p) => [...p, { role: "error", text: msg }]);
        setStatus("Error");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      setRows((prev) => [...prev, { role: "assistant", text: "" }]);

      const dec = new TextDecoder();
      let carry = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        carry += dec.decode(value, { stream: true });
        const { events, rest } = parseSseBuffer(carry);
        carry = rest;
        for (const ev of events) {
          if (ev.type === "delta") {
            assistantBuf += ev.text;
            flushAssistant();
          } else if (ev.type === "thinking_delta") {
            flushAssistant();
            thinkingAcc += ev.text;
            patchAssistantMeta();
          } else if (ev.type === "thinking_done") {
            flushAssistant();
          } else if (ev.type === "tool") {
            flushAssistant();
            if (ev.phase === "start") {
              toolsAcc.push({
                name: ev.name,
                detail: ev.detail ?? "",
              });
            } else {
              let idx = -1;
              for (let j = toolsAcc.length - 1; j >= 0; j -= 1) {
                if (toolsAcc[j].ok === undefined) {
                  idx = j;
                  break;
                }
              }
              const nextName =
                ev.name === "tool_result" && idx >= 0
                  ? toolsAcc[idx].name
                  : ev.name;
              const entry: ToolTraceEntry = {
                name: nextName,
                detail: ev.detail ?? (idx >= 0 ? toolsAcc[idx].detail : ""),
                ok: ev.ok,
              };
              if (idx >= 0) toolsAcc[idx] = entry;
              else toolsAcc.push(entry);
            }
            patchAssistantMeta();
          } else if (ev.type === "log") {
            flushAssistant();
            setRows((p) => [
              ...p,
              { role: "log", text: `[${ev.stream}] ${ev.message}` },
            ]);
          } else if (ev.type === "error") {
            flushAssistant();
            setRows((p) => [
              ...dropIfEmptyAssistant(p),
              { role: "error", text: ev.message },
            ]);
            setStatus("Error");
          } else if (ev.type === "done") {
            flushAssistant();
            setStatus("Done");
          }
        }
      }
      flushAssistant();
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setStatus("Stopped");
        setRows((p) => [
          ...dropIfEmptyAssistant(p),
          { role: "error", text: "Aborted" },
        ]);
      } else {
        setRows((p) => [
          ...dropIfEmptyAssistant(p),
          { role: "error", text: e instanceof Error ? e.message : String(e) },
        ]);
        setStatus("Error");
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      setStatus((s) => (s === "Streaming" ? "Idle" : s));
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!busy && selected?.available) void send();
    }
  };

  return (
    <div className="shell">
      <aside className="nav-rail" aria-label="Primary">
        <div className="nav-brand" title="Agent daemon demo">
          AD
        </div>
        <button type="button" className="nav-btn" title="Search (demo)">
          <IconSearch />
        </button>
        <button type="button" className="nav-btn active" title="Chat">
          <IconChat />
        </button>
        <div className="nav-spacer" />
        <button
          type="button"
          className="nav-btn"
          title="Refresh engines & models"
          onClick={() => {
            void refreshEngines();
            void refreshModels();
          }}
        >
          <svg {...iconSvgProps()}>
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 16h5v5" />
          </svg>
        </button>
      </aside>

      <aside
        id="engines-panel"
        className={`engine-panel ${
          isMobileLayout && enginesPanelOpen ? "open" : ""
        }`}
      >
        <div className="engine-panel-header">
          <div className="engine-panel-head-row">
            <h2 className="engine-panel-title">Engine options</h2>
            {isMobileLayout ? (
              <button
                type="button"
                className="panel-close-btn"
                aria-label="Close engines panel"
                onClick={() => setEnginesPanelOpen(false)}
              >
                ×
              </button>
            ) : null}
          </div>
          <p className="engine-panel-meta">
            {onlineCount}/{engines.length || 0} online · localhost
          </p>
        </div>
        {loadErr ? <div className="panel-error">{loadErr}</div> : null}
        {selected ? (
          <div className="engine-panel-body">
            <div className="engine-detail">
              <div className="engine-detail-label">Description</div>
              {selected.description}
              <div className="engine-detail-label" style={{ marginTop: 14 }}>
                Model
              </div>
              {(modelMeta?.models ?? []).length > 0 ? (
                <>
                  <select
                    className="model-input model-select"
                    value={modelSelectValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      setModelByEngine((p) => ({
                        ...p,
                        [selected.id]: v === "__custom__" ? "" : v,
                      }));
                    }}
                    disabled={!selected.available || busy}
                    aria-label="Choose model preset"
                  >
                    <option value="">Default (engine built-in)</option>
                    {(modelMeta?.models ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label ? `${m.label} · ${m.id}` : m.id}
                      </option>
                    ))}
                    <option value="__custom__">Custom id…</option>
                  </select>
                  {modelSelectValue === "__custom__" ? (
                    <input
                      className="model-input"
                      value={rawModelForSelected}
                      onChange={(e) =>
                        setModelByEngine((p) => ({
                          ...p,
                          [selected.id]: e.target.value,
                        }))
                      }
                      placeholder="Type model id"
                      disabled={!selected.available || busy}
                      aria-label="Custom model id"
                    />
                  ) : null}
                </>
              ) : (
                <input
                  className="model-input"
                  value={modelByEngine[selected.id] ?? ""}
                  onChange={(e) =>
                    setModelByEngine((p) => ({
                      ...p,
                      [selected.id]: e.target.value,
                    }))
                  }
                  placeholder="Default (engine built-in)"
                  disabled={!selected.available || busy}
                  aria-label="Model id"
                />
              )}
              <div className="model-actions">
                <button
                  type="button"
                  className="btn-mini"
                  disabled={busy}
                  onClick={() => void refreshModels()}
                >
                  Refresh models
                </button>
                <button
                  type="button"
                  className="btn-mini"
                  disabled={busy || !(modelByEngine[selected.id] ?? "").trim()}
                  onClick={() =>
                    setModelByEngine((p) => ({ ...p, [selected.id]: "" }))
                  }
                >
                  Clear
                </button>
              </div>
              {modelsErr ? (
                <div className="panel-error" style={{ marginTop: 8 }}>
                  {modelsErr}
                </div>
              ) : null}
              {modelMeta?.error ? (
                <div className="panel-error" style={{ marginTop: 8 }}>
                  {modelMeta.error}
                </div>
              ) : null}
              {modelMeta?.note ? (
                <div className="engine-note">{modelMeta.note}</div>
              ) : null}
              <div className="engine-detail-label" style={{ marginTop: 14 }}>
                Run options
              </div>
              <div className="run-options-stack">
                <label
                  className="engine-mini-label"
                  htmlFor={`cwd-${selected.id}`}
                >
                  Working directory (optional)
                </label>
                <div className="cwd-field">
                  <input
                    id={`cwd-${selected.id}`}
                    className="model-input cwd-field-input"
                    value={runForm.cwd}
                    onChange={(e) => patchRunForm({ cwd: e.target.value })}
                    placeholder="Relative to daemon cwd"
                    disabled={!selected.available || busy}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="cwd-field-browse"
                    title="Browse folders under daemon workspace"
                    disabled={!selected.available || busy}
                    onClick={() => setCwdPickerOpen(true)}
                  >
                    Browse…
                  </button>
                </div>
                <label
                  className="engine-mini-label"
                  htmlFor={`session-${selected.id}`}
                >
                  Session id
                </label>
                <input
                  id={`session-${selected.id}`}
                  className="model-input"
                  value={runForm.sessionId}
                  onChange={(e) => patchRunForm({ sessionId: e.target.value })}
                  placeholder="UUID / resume id (engine-specific)"
                  disabled={!selected.available || busy}
                />
                <label className="engine-mini-check">
                  <input
                    type="checkbox"
                    checked={runForm.continueSession}
                    onChange={(e) =>
                      patchRunForm({ continueSession: e.target.checked })
                    }
                    disabled={!selected.available || busy}
                  />
                  Continue session
                </label>
                {selected.id === "claude" ? (
                  <>
                    <label
                      className="engine-mini-label"
                      htmlFor={`perm-${selected.id}`}
                    >
                      Permission mode
                    </label>
                    <select
                      id={`perm-${selected.id}`}
                      className="model-input"
                      value={runForm.permissionMode}
                      onChange={(e) =>
                        patchRunForm({ permissionMode: e.target.value })
                      }
                      disabled={!selected.available || busy}
                    >
                      <option value="">Default (bypassPermissions)</option>
                      <option value="bypassPermissions">
                        bypassPermissions
                      </option>
                      <option value="acceptEdits">acceptEdits</option>
                      <option value="auto">auto</option>
                      <option value="default">default</option>
                      <option value="dontAsk">dontAsk</option>
                      <option value="plan">plan</option>
                    </select>
                    <label
                      className="engine-mini-label"
                      htmlFor={`adddir-${selected.id}`}
                    >
                      Extra dirs (--add-dir), comma-separated
                    </label>
                    <input
                      id={`adddir-${selected.id}`}
                      className="model-input"
                      value={runForm.addDirsCsv}
                      onChange={(e) =>
                        patchRunForm({ addDirsCsv: e.target.value })
                      }
                      placeholder="subdir, other/sub"
                      disabled={!selected.available || busy}
                    />
                  </>
                ) : null}
                {selected.id === "cursor_agent" ? (
                  <>
                    <label
                      className="engine-mini-label"
                      htmlFor={`exmode-${selected.id}`}
                    >
                      Execution mode
                    </label>
                    <select
                      id={`exmode-${selected.id}`}
                      className="model-input"
                      value={runForm.executionMode}
                      onChange={(e) =>
                        patchRunForm({ executionMode: e.target.value })
                      }
                      disabled={!selected.available || busy}
                    >
                      <option value="">Default</option>
                      <option value="plan">plan</option>
                      <option value="ask">ask</option>
                    </select>
                    <label className="engine-mini-check">
                      <input
                        type="checkbox"
                        checked={runForm.streamPartial}
                        onChange={(e) =>
                          patchRunForm({ streamPartial: e.target.checked })
                        }
                        disabled={!selected.available || busy}
                      />
                      Stream partial output
                    </label>
                  </>
                ) : null}
                {selected.id === "qwen" ? (
                  <>
                    <label
                      className="engine-mini-label"
                      htmlFor={`appr-${selected.id}`}
                    >
                      Approval mode
                    </label>
                    <select
                      id={`appr-${selected.id}`}
                      className="model-input"
                      value={runForm.approvalMode}
                      onChange={(e) =>
                        patchRunForm({ approvalMode: e.target.value })
                      }
                      disabled={!selected.available || busy}
                    >
                      <option value="">Default (yolo)</option>
                      <option value="yolo">yolo</option>
                      <option value="plan">plan</option>
                      <option value="default">default</option>
                      <option value="auto-edit">auto-edit</option>
                    </select>
                  </>
                ) : null}
              </div>
              {selected.integration ? (
                <>
                  <div
                    className="engine-detail-label"
                    style={{ marginTop: 14 }}
                  >
                    Extra argv (env)
                  </div>
                  <code className="engine-code">
                    {selected.integration.argvJsonEnvKey}
                  </code>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="engine-panel-placeholder">
            Choose an engine in the composer below.
          </div>
        )}
      </aside>

      <main className="chat-stage">
        {isMobileLayout && enginesPanelOpen ? (
          <button
            type="button"
            className="panel-backdrop"
            aria-label="Close engines panel"
            onClick={() => setEnginesPanelOpen(false)}
          />
        ) : null}
        <header className="chat-top">
          {isMobileLayout ? (
            <button
              type="button"
              className="engines-toggle"
              aria-expanded={enginesPanelOpen}
              aria-controls="engines-panel"
              onClick={() => setEnginesPanelOpen((o) => !o)}
            >
              <IconPanels />
              <span>Options</span>
            </button>
          ) : null}
          <div className="chat-top-actions">
            <div className="status-pill">
              Status: <strong>{status}</strong>
              {busy ? " · live" : ""}
            </div>
            <button
              type="button"
              className="btn-outline"
              disabled={!busy}
              onClick={stop}
            >
              Stop
            </button>
          </div>
        </header>

        <div className="chat-body">
          <div
            ref={scrollRef}
            className={`messages-wrap ${rows.length ? "has-msgs" : ""}`}
          >
            <div className="hero" aria-hidden={rows.length > 0}>
              <h1 className="hero-logo">Agent daemon</h1>
              <p className="hero-tag">
                Choose an engine below, then ask — streaming replies
                over SSE, same stack as your local CLIs.
              </p>
            </div>
            <div className="messages-inner">
              {rows.map((r, i) => (
                <div key={i} className={`msg ${r.role}`}>
                  {r.role === "user" ? (
                    <>
                      <div className="msg-label">You</div>
                      <div className="msg-bubble">{r.text}</div>
                    </>
                  ) : null}
                  {r.role === "assistant" ? (
                    <>
                      <div className="msg-label">Assistant</div>
                      {r.thinking?.trim() || (r.tools?.length ?? 0) > 0 ? (
                        <details className="msg-meta-drawer">
                          <summary className="msg-meta-summary">
                            Thinking & tools
                          </summary>
                          {r.thinking?.trim() ? (
                            <div className="msg-meta-block">
                              <div className="msg-meta-label">Thinking</div>
                              <pre className="msg-meta-pre">
                                {r.thinking.trim()}
                              </pre>
                            </div>
                          ) : null}
                          {(r.tools?.length ?? 0) > 0 ? (
                            <div className="msg-meta-block">
                              <div className="msg-meta-label">Tools</div>
                              <ul className="msg-tool-list">
                                {r.tools!.map((t, ti) => (
                                  <li key={ti} className="msg-tool-item">
                                    <div className="msg-tool-head">
                                      <span className="msg-tool-name">
                                        {t.name}
                                      </span>
                                      {t.ok !== undefined ? (
                                        <span
                                          className={
                                            t.ok ? "msg-tool-ok" : "msg-tool-err"
                                          }
                                        >
                                          {t.ok ? "ok" : "fail"}
                                        </span>
                                      ) : (
                                        <span className="msg-tool-run">
                                          running
                                        </span>
                                      )}
                                    </div>
                                    {t.detail ? (
                                      <pre className="msg-meta-pre msg-tool-detail">
                                        {t.detail}
                                      </pre>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </details>
                      ) : null}
                      <div
                        className={`msg-bubble${
                          busy && i === rows.length - 1
                            ? " msg-bubble-streaming"
                            : ""
                        }`}
                      >
                        {r.text}
                        {busy && i === rows.length - 1 ? (
                          <span
                            className="stream-wait-dot"
                            aria-hidden
                            title="Waiting for next chunk"
                          />
                        ) : null}
                      </div>
                      {busy && i === rows.length - 1 ? (
                        <div className="msg-stream-bar" aria-hidden />
                      ) : null}
                    </>
                  ) : null}
                  {r.role === "log" ? (
                    <>
                      <div className="msg-label">Log</div>
                      <div className="msg-bubble">{r.text}</div>
                    </>
                  ) : null}
                  {r.role === "error" ? (
                    <>
                      <div className="msg-label">Error</div>
                      <div className="msg-bubble">{r.text}</div>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="composer-anchor">
            <div className="composer-pill">
              <span className="attach-btn" title="Attachments (demo)">
                <IconPaperclip />
              </span>
              <div className="composer-input-wrap">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="How can I help you today?"
                  disabled={busy || !selected?.available}
                  rows={1}
                  aria-label="Message"
                />
              </div>
              <div className="composer-right">
                <div className="engine-select-wrap">
                  <select
                    value={engineId}
                    onChange={(e) => setEngineId(e.target.value)}
                    disabled={busy}
                    aria-label="Engine"
                  >
                    {engines.map((e) => (
                      <option key={e.id} value={e.id} disabled={!e.available}>
                        {e.label}
                        {!e.available ? " (offline)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="send-fab"
                  title="Send"
                  disabled={busy || !selected?.available || !input.trim()}
                  onClick={() => void send()}
                >
                  <IconSend />
                </button>
              </div>
            </div>
            <p className="hint-bar">Enter to send · Shift+Enter newline</p>
          </div>
        </div>
      </main>
      <CwdBrowseModal
        open={cwdPickerOpen}
        onClose={() => setCwdPickerOpen(false)}
        initialRel={runForm.cwd}
        onPick={(rel) => patchRunForm({ cwd: rel })}
        disabled={!selected?.available || busy}
      />
    </div>
  );
}
