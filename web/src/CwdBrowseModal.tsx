import { useCallback, useEffect, useState } from "react";

type WorkspaceListPayload = {
  rel: string;
  absolute: string;
  parentRel: string | null;
  entries: { name: string; type: "dir" }[];
};

function folderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

export function CwdBrowseModal(props: {
  open: boolean;
  onClose: () => void;
  initialRel: string;
  onPick: (relativePath: string) => void;
  disabled?: boolean;
}) {
  const { open, onClose, initialRel, onPick, disabled } = props;
  const [root, setRoot] = useState("");
  const [data, setData] = useState<WorkspaceListPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  const loadList = useCallback(async (nextRel: string) => {
    setLoading(true);
    setFetchErr(null);
    try {
      const r = await fetch(
        `/api/workspace/list?rel=${encodeURIComponent(nextRel)}`,
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: unknown };
        const msg =
          typeof j.error === "string"
            ? j.error
            : `HTTP ${r.status}`;
        throw new Error(msg);
      }
      const j = (await r.json()) as WorkspaceListPayload;
      setData(j);
    } catch (e) {
      setFetchErr(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFetchErr(null);
    void (async () => {
      try {
        const r = await fetch("/api/workspace");
        if (!r.ok) throw new Error(`workspace ${r.status}`);
        const j = (await r.json()) as { root?: string };
        if (!cancelled && typeof j.root === "string") setRoot(j.root);
      } catch {
        if (!cancelled) setRoot("");
      }
    })();
    const startRel = initialRel.trim().replace(/\\/g, "/");
    void loadList(startRel);
    return () => {
      cancelled = true;
    };
  }, [open, initialRel, loadList]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const goParent = () => {
    if (data?.parentRel === undefined || data.parentRel === null) return;
    void loadList(data.parentRel ?? "");
  };

  const enterDir = (name: string) => {
    const baseRel = data?.rel ?? "";
    const next =
      baseRel === "" ? name : `${baseRel.replace(/\/+$/, "")}/${name}`;
    void loadList(next);
  };

  const pickCurrent = () => {
    onPick(data?.rel ?? "");
    onClose();
  };

  return (
    <div
      className="cwd-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="cwd-modal"
        role="dialog"
        aria-labelledby="cwd-modal-title"
        aria-modal="true"
      >
        <div className="cwd-modal-head">
          <h2 id="cwd-modal-title" className="cwd-modal-title">
            Workspace folder
          </h2>
          <button
            type="button"
            className="cwd-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="cwd-modal-root" title={root}>
          Daemon root:{" "}
          <code className="cwd-modal-root-path">{root || "…"}</code>
        </p>
        <div className="cwd-modal-toolbar">
          <button
            type="button"
            className="btn-mini cwd-modal-up"
            disabled={
              disabled ||
              loading ||
              data?.parentRel === undefined ||
              data?.parentRel === null
            }
            onClick={goParent}
          >
            ↑ Parent
          </button>
          <span className="cwd-modal-current" title={data?.absolute}>
            {(data?.rel ?? "") === "" ? "(daemon root)" : data?.rel}
          </span>
        </div>
        {fetchErr ? (
          <div className="cwd-modal-error">{fetchErr}</div>
        ) : null}
        <div className="cwd-modal-list-wrap">
          {loading ? (
            <div className="cwd-modal-loading">Loading…</div>
          ) : (
            <ul className="cwd-modal-list">
              {(data?.entries ?? []).map((e) => (
                <li key={e.name}>
                  <button
                    type="button"
                    className="cwd-modal-row"
                    disabled={disabled}
                    onClick={() => enterDir(e.name)}
                  >
                    <span className="cwd-modal-folder-ic">{folderIcon()}</span>
                    <span className="cwd-modal-row-name">{e.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading &&
          data &&
          (data.entries?.length ?? 0) === 0 &&
          !fetchErr ? (
            <div className="cwd-modal-empty">No subfolders</div>
          ) : null}
        </div>
        <div className="cwd-modal-actions">
          <button
            type="button"
            className="btn-outline cwd-modal-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cwd-modal-use"
            disabled={disabled || !!fetchErr || loading}
            onClick={pickCurrent}
          >
            Use this folder
          </button>
        </div>
      </div>
    </div>
  );
}
