import { useEffect, useRef } from "react";
import type { PipelineState } from "../lib/types";
import { IconBolt, IconCheck } from "./icons";

export function Pipeline({ pipeline }: { pipeline: PipelineState }) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [pipeline.logs.length]);

  return (
    <div className="pipeline">
      <div className="pipeline-card">
        <div className="pl-head">
          <span className="pl-badge">
            <IconBolt size={14} />
            RAG PIPELINE
          </span>
          <h2 className="pl-title">{pipeline.docName}</h2>
          <p className="pl-sub">Chunking → embedding → indexing → summarizing. Watch every stage.</p>
        </div>

        <div className="pl-bar" role="progressbar" aria-valuenow={Math.round(pipeline.progress)} aria-valuemin={0} aria-valuemax={100}>
          <div className="pl-bar-fill" style={{ width: `${pipeline.progress}%` }} />
        </div>

        <ol className="pl-steps">
          {pipeline.steps.map((s, i) => (
            <li key={s.key} className={`pl-step ${s.state}`}>
              <span className="pl-dot">
                {s.state === "done" ? <IconCheck size={11} /> : s.state === "running" ? <span className="pl-spin" /> : <span className="pl-idx">{i + 1}</span>}
              </span>
              <span className="pl-body">
                <span className="pl-row">
                  <strong>{s.label}</strong>
                  <code>{s.tech}</code>
                </span>
                {s.detail && <span className="pl-detail">{s.detail}</span>}
              </span>
              <span className="pl-state">
                {s.state === "done" ? "done" : s.state === "running" ? "running" : "queued"}
              </span>
            </li>
          ))}
        </ol>

        <div className="pl-console" ref={logRef}>
          {pipeline.logs.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          <p className="pl-caret">▌</p>
        </div>
      </div>
    </div>
  );
}
