/**
 * DocuMind persistence layer.
 *
 * Local-first: everything is stored in localStorage so the demo works with
 * zero configuration. If VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are
 * provided, every write is mirrored to Supabase as well (documents +
 * chat_threads tables), so swapping to a hosted backend is a config change:
 *
 *   documents    (id uuid pk, name text, kind text, body text, added_at timestamptz)
 *   chat_threads (doc_id uuid, messages jsonb, updated_at timestamptz)
 *
 * In production the document text would go through the FastAPI worker for
 * chunking + NVIDIA nv-embedqa-e5-v5 embeddings before landing in pgvector.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ChatMsg, StoredDoc } from "./types";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

export const DB_STATUS = supabase ? "Supabase linked" : "Local-first · Supabase-ready";

const DOC_KEY = "documind.documents.v1";
const THREAD_KEY = "documind.threads.v1";

function readJSON<T>(storageKey: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(storageKey: string, value: unknown) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — keep the session in memory */
  }
}

/* --------------------------------- documents -------------------------------- */

export function loadDocs(): StoredDoc[] {
  return readJSON<StoredDoc[]>(DOC_KEY, []);
}

export function saveDocs(docs: StoredDoc[]) {
  writeJSON(DOC_KEY, docs);
  if (supabase) {
    supabase
      .from("documents")
      .upsert(
        docs.map((d) => ({ id: d.id, name: d.name, kind: d.kind, body: d.text, added_at: new Date(d.addedAt).toISOString() })),
        { onConflict: "id" }
      )
      .then(() => undefined, () => undefined);
  }
}

/* --------------------------------- threads ---------------------------------- */

export function loadThreads(): Record<string, ChatMsg[]> {
  return readJSON<Record<string, ChatMsg[]>>(THREAD_KEY, {});
}

export function saveThreads(threads: Record<string, ChatMsg[]>) {
  writeJSON(THREAD_KEY, threads);
  if (supabase) {
    for (const [docId, messages] of Object.entries(threads)) {
      supabase
        .from("chat_threads")
        .upsert({ doc_id: docId, messages, updated_at: new Date().toISOString() }, { onConflict: "doc_id" })
        .then(() => undefined, () => undefined);
    }
  }
}

/* --------------------------------- export ----------------------------------- */

export function exportSummaryMarkdown(
  doc: StoredDoc,
  data: {
    docType: string;
    summary: string;
    keyPoints: string[];
    riskScore: number;
    riskLabel: string;
    detections: { title: string; severity: string; excerpt: string }[];
  }
): void {
  const lines: string[] = [
    `# ${doc.name} — DocuMind executive summary`,
    "",
    `- Document type: ${data.docType}`,
    `- Risk posture: **${data.riskLabel}** (score ${data.riskScore}/100)`,
    `- Generated: ${new Date().toLocaleString()}`,
    "",
    "## TL;DR",
    "",
    data.summary,
    "",
    "## Key takeaways",
    "",
    ...data.keyPoints.map((k) => `- ${k}`),
    "",
    "## Flagged clauses",
    "",
  ];
  for (const d of data.detections) {
    lines.push(`### [${d.severity.toUpperCase()}] ${d.title}`, "", `> ${d.excerpt}`, "");
  }
  lines.push("---", "_Produced by DocuMind AI — RAG workspace (React + pgvector-ready + NVIDIA NIM)._");
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${doc.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}.summary.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
