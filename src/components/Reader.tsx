import { useEffect, useRef, useState } from "react";
import type { Analysis, Detection, Severity, StoredDoc } from "../lib/types";
import { SEVERITY_LABEL, SEVERITY_RANK } from "../lib/types";
import { IconShieldAlert, TypeIcon } from "./icons";

interface ReaderProps {
  doc: StoredDoc;
  analysis: Analysis;
  selected: { chunkId: string; ts: number } | null;
  onOpenDetection: (det: Detection) => void;
}

interface TipState {
  det: Detection;
  x: number;
  y: number;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  contract: "Contract",
  financial: "Financial",
  academic: "Research",
  general: "Document",
};

export function Reader({ doc, analysis, selected, onOpenDetection }: ReaderProps) {
  const chunkEls = useRef<Record<string, HTMLElement | null>>({});
  const [tip, setTip] = useState<TipState | null>(null);

  /* flash + scroll to a chunk when cited from chat or clause list */
  useEffect(() => {
    if (!selected) return;
    const el = chunkEls.current[selected.chunkId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("flash");
    void el.offsetWidth; // restart animation
    el.classList.add("flash");
    const t = setTimeout(() => el.classList.remove("flash"), 1900);
    return () => clearTimeout(t);
  }, [selected]);

  /* scroll-reveal chunks */
  useEffect(() => {
    const els = Object.values(chunkEls.current).filter(Boolean) as HTMLElement[];
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.04, rootMargin: "0px 0px -6% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [analysis]);

  const showTip = (det: Detection, e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(12, Math.min(rect.left, window.innerWidth - 336));
    const y = Math.min(rect.bottom + 10, window.innerHeight - 190);
    setTip({ det, x, y });
  };

  /* heat rail: one segment per chunk, colored by its worst detection */
  const worstByChunk = new Map<string, Severity>();
  for (const d of analysis.detections) {
    const prev = worstByChunk.get(d.chunkId);
    if (!prev || SEVERITY_RANK[d.severity] > SEVERITY_RANK[prev]) worstByChunk.set(d.chunkId, d.severity);
  }
  const totalWords = analysis.chunks.reduce((s, c) => s + c.words, 0) || 1;

  const renderChunkBody = (chunkId: string, text: string) => {
    const dets = analysis.detections
      .filter((d) => d.chunkId === chunkId)
      .sort((a, b) => a.start - b.start);
    const nodes: React.ReactNode[] = [];
    let pos = 0;
    let k = 0;
    for (const det of dets) {
      if (det.start < pos) continue; // skip overlapping ranges
      if (det.start > pos) nodes.push(<span key={`t${k++}`}>{text.slice(pos, det.start)}</span>);
      nodes.push(
        <mark
          key={`m${k++}`}
          className={`mk mk-${det.severity}`}
          onMouseEnter={(e) => showTip(det, e)}
          onMouseLeave={() => setTip(null)}
          onFocus={(e) => showTip(det, e as unknown as React.MouseEvent<HTMLElement>)}
          onBlur={() => setTip(null)}
          tabIndex={0}
        >
          {text.slice(det.start, det.end)}
        </mark>
      );
      pos = det.end;
    }
    if (pos < text.length) nodes.push(<span key={`t${k++}`}>{text.slice(pos)}</span>);
    return nodes;
  };

  return (
    <div className="reader">
      <div className="heat-rail" aria-hidden>
        {analysis.chunks.map((c) => {
          const sev = worstByChunk.get(c.id);
          return (
            <button
              key={c.id}
              className={`heat-seg${sev ? ` hs-${sev}` : ""}`}
              style={{ flexGrow: Math.max(c.words, 20) / totalWords * 100 }}
              title={`§${c.index + 1} · page ${c.page}${sev ? ` · ${SEVERITY_LABEL[sev]}` : ""}`}
              onClick={() => {
                const el = chunkEls.current[c.id];
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                el?.classList.add("flash");
                setTimeout(() => el?.classList.remove("flash"), 1900);
              }}
            />
          );
        })}
      </div>

      <article className="paper">
        <header className="paper-head">
          <div className="paper-kicker">
            <TypeIcon type={analysis.docType} size={14} />
            <span>Indexed source · {doc.kind === "pdf" ? "PDF" : "plaintext"}</span>
          </div>
          <h1 className="paper-title">{doc.name}</h1>
          <div className="paper-meta">
            <span className={`stamp st-${analysis.docType}`}>{DOC_TYPE_LABEL[analysis.docType]}</span>
            <span>{doc.words.toLocaleString()} words</span>
            <span className="meta-dot">·</span>
            <span>{analysis.chunks.length} chunks</span>
            <span className="meta-dot">·</span>
            <span>{analysis.readingMinutes} min read</span>
            <span className="meta-dot">·</span>
            <span>{analysis.detections.length} flags</span>
          </div>
        </header>

        <div className="paper-body">
          {analysis.chunks.map((c) => (
            <section
              key={c.id}
              className="chunk"
              ref={(el) => {
                chunkEls.current[c.id] = el;
              }}
            >
              <span className="chunk-tag">§{c.index + 1} · p{c.page}</span>
              <p className="chunk-text">{renderChunkBody(c.id, c.text)}</p>
            </section>
          ))}
        </div>

        <footer className="paper-foot">
          <span className="pf-mark">◆</span>
          <p>
            End of document — {analysis.chunks.length} passages embedded (512-dim, cosine) ·{" "}
            {analysis.detections.length > 0 ? (
              <>
                {analysis.detections.length} clause flags raised ·{" "}
                <button className="link-btn" onClick={() => {
                  const top = analysis.detections[0];
                  if (top) onOpenDetection(top);
                }}>
                  review the top flag <IconShieldAlert size={12} />
                </button>
              </>
            ) : (
              "no clause flags raised"
            )}
          </p>
        </footer>
      </article>

      {tip && (
        <div className="det-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          <div className="dt-head">
            <span className={`sev-pill sev-${tip.det.severity}`}>{SEVERITY_LABEL[tip.det.severity]}</span>
            <strong>{tip.det.title}</strong>
          </div>
          <p className="dt-reason">{tip.det.reason}</p>
          <div className="dt-foot">
            <code>§{tip.det.chunkIndex + 1}</code>
            <button className="link-btn" onClick={() => onOpenDetection(tip.det)}>
              Open in clause list
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
