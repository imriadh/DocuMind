import { useMemo, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Intake } from "./components/Intake";
import { Pipeline } from "./components/Pipeline";
import { Reader } from "./components/Reader";
import { RightPanel, type PanelTab } from "./components/RightPanel";
import { analyzeDocument, countWords, uid } from "./lib/analysis";
import { exportSummaryMarkdown, loadDocs, loadThreads, saveDocs, saveThreads } from "./lib/db";
import { extractPdfText } from "./lib/pdf";
import { SAMPLES } from "./lib/samples";
import type {
  Analysis,
  ChatMsg,
  DocStats,
  PipelineState,
  StoredDoc,
  Toast,
} from "./lib/types";
import { IconDownload, IconMenu, IconPanel, IconRefresh, IconTrash, IconUpload } from "./components/icons";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function makePipeline(docName: string): PipelineState {
  return {
    docId: "",
    docName,
    progress: 2,
    logs: [`[doc] accepted “${docName}”`],
    steps: [
      { key: "parse", label: "Parse document", tech: "pdf.js / text decoder", state: "pending" },
      { key: "chunk", label: "Chunk text", tech: "recursive · ~120 tok", state: "pending" },
      { key: "embed", label: "Embed passages", tech: "nv-embedqa-e5-v5", state: "pending" },
      { key: "index", label: "Index vectors", tech: "pgvector · cosine", state: "pending" },
      { key: "summarize", label: "Draft TL;DR", tech: "llama-3.1-8b-instruct", state: "pending" },
      { key: "risk", label: "Risk scan", tech: "clause classifier", state: "pending" },
    ],
  };
}

export default function App() {
  const [docs, setDocs] = useState<StoredDoc[]>(() => loadDocs());
  const [threads, setThreads] = useState<Record<string, ChatMsg[]>>(() => loadThreads());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<PanelTab>("overview");
  const [pipeline, setPipeline] = useState<PipelineState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<{ chunkId: string; ts: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const runId = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastId = useRef(0);
  const confirmTimer = useRef<number | undefined>(undefined);
  const rafPending = useRef(false);

  const activeDoc = docs.find((d) => d.id === activeId) ?? null;
  const analysis: Analysis | null = useMemo(
    () => (activeDoc ? analyzeDocument(activeDoc) : null),
    [activeDoc]
  );

  const stats: Record<string, DocStats> = useMemo(() => {
    const out: Record<string, DocStats> = {};
    for (const d of docs) {
      const a = analyzeDocument(d);
      out[d.id] = { flags: a.detections.length, riskScore: a.riskScore, chunks: a.chunks.length, docType: a.docType };
    }
    return out;
  }, [docs]);

  /* ------------------------------- toasts -------------------------------- */
  const pushToast = (kind: Toast["kind"], text: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  };

  /* ------------------------------ pipeline -------------------------------- */
  const runPipeline = async (doc: StoredDoc) => {
    const myRun = ++runId.current;
    const base = makePipeline(doc.name);
    base.docId = doc.id;
    setPipeline(base);

    const patch = (fn: (p: PipelineState) => PipelineState) => {
      if (runId.current !== myRun) return;
      setPipeline((prev) => (prev ? fn(prev) : prev));
    };
    const step = (key: string, state: "running" | "done", detail?: string, log?: string) =>
      patch((p) => ({
        ...p,
        steps: p.steps.map((s) => (s.key === key ? { ...s, state, detail: detail ?? s.detail } : s)),
        logs: log ? [...p.logs, log] : p.logs,
      }));

    const analysisResult = analyzeDocument(doc);
    const n = analysisResult.chunks.length;
    const seq: Array<{ key: string; wait: number; detail: string; logs: string[] }> = [
      {
        key: "parse",
        wait: 620,
        detail: `${doc.words.toLocaleString()} words · ${doc.kind === "pdf" ? "PDF text layer" : "UTF-8 plaintext"}`,
        logs: [`[parse] ${doc.kind === "pdf" ? "pdf.js extracted the text layer" : "decoded plaintext"} — ${doc.words.toLocaleString()} words`],
      },
      {
        key: "chunk",
        wait: 540,
        detail: `${n} chunks · ~120 tokens · 10% overlap`,
        logs: [`[chunk] recursive splitter produced ${n} passages`],
      },
      {
        key: "embed",
        wait: 980,
        detail: `${n} × 512-dim · NVIDIA NIM`,
        logs: [`[embed] POST build.nvidia.com/v1/embeddings — nv-embedqa-e5-v5`, `[embed] received ${n} vectors (512-dim, float32)`],
      },
      {
        key: "index",
        wait: 560,
        detail: `pgvector · ivfflat · cosine`,
        logs: [`[index] INSERT ${n} rows INTO chunks(embedding vector(512))`, `[index] CREATE INDEX … USING ivfflat (embedding vector_cosine_ops)`],
      },
      {
        key: "summarize",
        wait: 900,
        detail: `TL;DR + ${analysisResult.keyPoints.length} takeaways`,
        logs: [`[gen] meta/llama-3.1-8b-instruct → executive summary`, `[gen] extracted ${analysisResult.keyPoints.length} key takeaways`],
      },
      {
        key: "risk",
        wait: 700,
        detail: `${analysisResult.detections.length} flags · score ${analysisResult.riskScore}/100`,
        logs: [`[scan] clause classifier raised ${analysisResult.detections.length} flags`, `[done] risk posture: ${analysisResult.riskLabel}`],
      },
    ];

    for (let i = 0; i < seq.length; i++) {
      if (runId.current !== myRun) return;
      step(seq[i].key, "running", undefined, seq[i].logs[0]);
      await sleep(seq[i].wait * 0.55);
      for (const extra of seq[i].logs.slice(1)) step(seq[i].key, "running", undefined, extra);
      await sleep(seq[i].wait * 0.45);
      step(seq[i].key, "done", seq[i].detail);
      patch((p) => ({ ...p, progress: Math.round(((i + 1) / seq.length) * 100) }));
    }

    if (runId.current !== myRun) return;
    setPipeline(null);
    setTab("overview");
    pushToast(
      "success",
      `Analysis complete — ${analysisResult.detections.length} flags, TL;DR ready. ${analysisResult.riskLabel}.`
    );
  };

  /* ----------------------------- add document ------------------------------ */
  const addDocument = (name: string, text: string, kind: StoredDoc["kind"]) => {
    const clean = text.replace(/\r\n/g, "\n").trim();
    const words = countWords(clean);
    if (words < 40) {
      pushToast("error", "That file is too short to analyze (need at least ~40 words).");
      return;
    }
    const doc: StoredDoc = { id: uid(), name: name.replace(/\.[^.]+$/, ""), kind, text: clean, addedAt: Date.now(), words };
    const next = [doc, ...docs];
    setDocs(next);
    saveDocs(next);
    setActiveId(doc.id);
    setConfirmDelete(false);
    void runPipeline(doc);
  };

  const handleFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const lower = file.name.toLowerCase();
      if (!/\.(pdf|txt|md)$/.test(lower)) {
        pushToast("error", `“${file.name}” — unsupported type. Use PDF, TXT or MD.`);
        continue;
      }
      if (file.size > 15 * 1024 * 1024) {
        pushToast("error", `“${file.name}” is over 15 MB — trim it down first.`);
        continue;
      }
      try {
        if (lower.endsWith(".pdf")) {
          pushToast("info", `Extracting text from “${file.name}”…`);
          const text = await extractPdfText(file);
          if (!text) {
            pushToast("error", `No extractable text in “${file.name}” — it may be a scanned image PDF.`);
            continue;
          }
          addDocument(file.name, text, "pdf");
        } else {
          const text = await file.text();
          addDocument(file.name, text, "text");
        }
      } catch {
        pushToast("error", `Could not parse “${file.name}”. Try another file.`);
      }
    }
  };

  const handleSample = (id: string) => {
    const existing = docs.find((d) => d.id === id);
    if (existing) {
      setActiveId(id);
      pushToast("info", "Already in your library — reopened.");
      return;
    }
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) return;
    const doc: StoredDoc = { id: sample.id, name: sample.name, kind: "text", text: sample.text, addedAt: Date.now(), words: countWords(sample.text) };
    const next = [doc, ...docs];
    setDocs(next);
    saveDocs(next);
    setActiveId(doc.id);
    void runPipeline(doc);
  };

  /* ------------------------------- actions --------------------------------- */
  const selectDoc = (id: string) => {
    setActiveId(id);
    setConfirmDelete(false);
    setSidebarOpen(false);
    setProgress(0);
  };

  const deleteDoc = (id: string) => {
    const doc = docs.find((d) => d.id === id);
    const next = docs.filter((d) => d.id !== id);
    setDocs(next);
    saveDocs(next);
    if (activeId === id) setActiveId(null);
    pushToast("info", `Removed “${doc?.name ?? "document"}” and its vectors from the index.`);
  };

  const rerun = () => {
    if (activeDoc) void runPipeline(activeDoc);
  };

  const exportDoc = () => {
    if (!activeDoc || !analysis) return;
    exportSummaryMarkdown(activeDoc, {
      docType: analysis.docType,
      summary: analysis.summary,
      keyPoints: analysis.keyPoints,
      riskScore: analysis.riskScore,
      riskLabel: analysis.riskLabel,
      detections: analysis.detections.map((d) => ({ title: d.title, severity: d.severity, excerpt: d.excerpt })),
    });
    pushToast("success", "Executive summary exported as Markdown.");
  };

  const jumpToChunk = (chunkId: string) => {
    setSelected({ chunkId, ts: Date.now() });
    if (window.innerWidth < 1180) setPanelOpen(false);
  };

  const onThreadChange = (msgs: ChatMsg[]) => {
    if (!activeId) return;
    const next = { ...threads, [activeId]: msgs };
    setThreads(next);
    saveThreads(next);
  };

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    if (rafPending.current) return;
    rafPending.current = true;
    const el = e.currentTarget;
    requestAnimationFrame(() => {
      rafPending.current = false;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? (el.scrollTop / max) * 100 : 0);
    });
  };

  const askDelete = () => {
    if (!activeDoc) return;
    if (confirmDelete) {
      deleteDoc(activeDoc.id);
      return;
    }
    setConfirmDelete(true);
    window.clearTimeout(confirmTimer.current);
    confirmTimer.current = window.setTimeout(() => setConfirmDelete(false), 2600);
  };

  const activeStats = activeDoc ? stats[activeDoc.id] : null;

  return (
    <div className="app">
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.txt,.md"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <Sidebar
        docs={docs}
        stats={stats}
        activeId={activeId}
        onSelect={selectDoc}
        onDelete={deleteDoc}
        onNew={() => fileRef.current?.click()}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open library">
            <IconMenu size={17} />
          </button>
          {activeDoc ? (
            <>
              <div className="tb-doc">
                <h1 className="tb-title">{activeDoc.name}</h1>
                <p className="tb-meta">
                  {activeStats?.docType ?? "document"} · {activeStats?.chunks ?? "—"} chunks · risk{" "}
                  <b className={`risk-num risk-${(activeStats?.riskScore ?? 0) >= 70 ? "crit" : (activeStats?.riskScore ?? 0) >= 45 ? "high" : (activeStats?.riskScore ?? 0) >= 22 ? "med" : "low"}`}>
                    {activeStats?.riskScore ?? "—"}
                  </b>
                  /100
                </p>
              </div>
              <div className="tb-actions">
                <button className="btn btn-ghost" onClick={exportDoc}>
                  <IconDownload size={14} /> <span>Export</span>
                </button>
                <button className="btn btn-ghost" onClick={rerun} disabled={!!pipeline}>
                  <IconRefresh size={14} /> <span>Re-run</span>
                </button>
                <button className={`btn btn-ghost danger${confirmDelete ? " confirm" : ""}`} onClick={askDelete}>
                  <IconTrash size={14} /> <span>{confirmDelete ? "Confirm?" : "Delete"}</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="tb-doc">
                <h1 className="tb-title">Workspace</h1>
                <p className="tb-meta">your library persists in this browser · Supabase mirror optional</p>
              </div>
              <div className="tb-actions">
                <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                  <IconUpload size={14} /> <span>Upload</span>
                </button>
              </div>
            </>
          )}
        </header>

        {activeDoc && (
          <div className="read-progress" aria-hidden>
            <div className="read-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}

        <main className="main-scroll" onScroll={handleScroll}>
          {!activeDoc ? (
            <Intake onFiles={(f) => void handleFiles(f)} onSample={handleSample} busy={!!pipeline} hasDocs={docs.length > 0} />
          ) : pipeline && pipeline.docId === activeId ? (
            <Pipeline pipeline={pipeline} />
          ) : analysis ? (
            <Reader
              doc={activeDoc}
              analysis={analysis}
              selected={selected}
              onOpenDetection={() => {
                setTab("clauses");
                setPanelOpen(true);
              }}
            />
          ) : null}
        </main>

        {activeDoc && analysis && !pipeline && (
          <button className="panel-toggle" onClick={() => setPanelOpen(true)}>
            <IconPanel size={15} />
            Insights · {analysis.detections.length} flags
          </button>
        )}
      </div>

      {activeDoc && analysis && (
        <div className={`rp-wrap${panelOpen ? " rp-open" : ""}`}>
          <RightPanel
            doc={activeDoc}
            analysis={analysis}
            tab={tab}
            onTab={setTab}
            thread={threads[activeDoc.id] ?? []}
            onThreadChange={onThreadChange}
            onJumpToChunk={jumpToChunk}
            onClose={() => setPanelOpen(false)}
          />
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span className="toast-bar" />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
