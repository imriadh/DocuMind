import { useRef, useState } from "react";
import { SAMPLES } from "../lib/samples";
import {
  IconArrowRight,
  IconBolt,
  IconChunks,
  IconDb,
  IconIndex,
  IconScissors,
  IconUpload,
  IconVector,
} from "./icons";

interface IntakeProps {
  onFiles: (files: FileList) => void;
  onSample: (id: string) => void;
  busy: boolean;
  hasDocs: boolean;
}

const STEPS = [
  { icon: IconScissors, label: "Parse", tech: "pdf.js / pypdf", note: "text layer lifted from PDF or plaintext" },
  { icon: IconChunks, label: "Chunk", tech: "recursive splitter", note: "~120 tokens, 10% overlap" },
  { icon: IconVector, label: "Embed", tech: "nv-embedqa-e5-v5", note: "512-dim vectors via NVIDIA NIM" },
  { icon: IconIndex, label: "Index", tech: "pgvector · cosine", note: "similarity search in PostgreSQL" },
  { icon: IconBolt, label: "Generate", tech: "llama-3.1-8b-instruct", note: "answers grounded in retrieved passages" },
];

export function Intake({ onFiles, onSample, busy, hasDocs }: IntakeProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="intake">
      <div className="intake-grid">
        <div className="intake-left">
          <p className="eyebrow">
            <span className="eyebrow-dot" />
            RAG workspace · reads locally · Supabase-ready
          </p>
          <h1 className="intake-title">
            Dense documents,
            <br />
            <span className="swipe-word">
              decoded
              <svg className="swipe" viewBox="0 0 220 14" preserveAspectRatio="none" aria-hidden>
                <path d="M3 10 C 60 3, 150 2, 217 7" stroke="#F0E14E" strokeWidth="7" strokeLinecap="round" fill="none" />
              </svg>
            </span>{" "}
            in seconds.
          </h1>
          <p className="intake-lede">
            Upload a contract, a 10-Q, or a paper. DocuMind chunks it, embeds every passage,
            writes the <strong>TL;DR</strong>, flags the clauses worth arguing about — and then
            lets you interrogate the text directly.
          </p>

          <div
            className={`dropzone${dragging ? " dragging" : ""}${busy ? " busy" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!busy && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
            }}
            onClick={() => !busy && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) inputRef.current?.click();
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.txt,.md"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) onFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="dz-tray">
              <div className="dz-sheet s1" />
              <div className="dz-sheet s2" />
              <div className="dz-sheet s3">
                <span className="dz-line" />
                <span className="dz-line short" />
                <span className="dz-line" />
              </div>
              <span className="dz-arrow">
                <IconUpload size={20} />
              </span>
            </div>
            <div className="dz-copy">
              <strong>{busy ? "Pipeline running…" : dragging ? "Release to analyze" : "Drop a document here"}</strong>
              <span>PDF · TXT · MD — parsed and indexed entirely in your browser</span>
            </div>
          </div>

          <div className="intake-facts">
            <span><b>0</b> servers required for the demo</span>
            <span><b>6</b> stage RAG pipeline</span>
            <span><b>1-click</b> executive export</span>
          </div>
        </div>

        <div className="intake-right">
          <div className="samples-head">
            <h2>No document handy?</h2>
            <p>Run the pipeline on a specimen — three genres, three very different risk profiles.</p>
          </div>
          <div className="samples">
            {SAMPLES.map((s, i) => (
              <button key={s.id} className={`sheet r${i}`} onClick={() => onSample(s.id)} disabled={busy}>
                <span className="sheet-stamp">{s.stamp}</span>
                <span className="sheet-title">{s.name}</span>
                <span className="sheet-blurb">{s.blurb}</span>
                <span className="sheet-cta">
                  Run analysis <IconArrowRight size={13} />
                </span>
              </button>
            ))}
          </div>
          {hasDocs && <p className="samples-hint">Your previous analyses are waiting in the library on the left.</p>}
        </div>
      </div>

      <section className="pipe-explainer">
        <div className="pipe-head">
          <h2>Under the hood — the exact loop this demo runs</h2>
          <p>
            Retrieval-Augmented Generation: the model never free-answers. It only synthesizes
            passages your question actually matched.
          </p>
        </div>
        <ol className="pipe-steps">
          {STEPS.map((s, i) => (
            <li key={s.label} style={{ animationDelay: `${i * 90}ms` }}>
              <span className="ps-ic"><s.icon size={17} /></span>
              <span className="ps-num">{String(i + 1).padStart(2, "0")}</span>
              <strong>{s.label}</strong>
              <code>{s.tech}</code>
              <span className="ps-note">{s.note}</span>
              {i < STEPS.length - 1 && <span className="ps-conn" aria-hidden />}
            </li>
          ))}
        </ol>
        <p className="pipe-foot">
          Frontend: React + pure CSS · Storage: Supabase (local-first fallback) · Vector store: pgvector schema ·
          Inference: NVIDIA NIM endpoints — swap <code>src/lib/db.ts</code> credentials and the demo goes hosted.
        </p>
      </section>
    </div>
  );
}
