import type { DocStats, StoredDoc } from "../lib/types";
import { DB_STATUS } from "../lib/db";
import {
  IconClose,
  IconDb,
  IconTrash,
  IconUpload,
  LogoMark,
  TypeIcon,
} from "./icons";

interface SidebarProps {
  docs: StoredDoc[];
  stats: Record<string, DocStats>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  open: boolean;
  onClose: () => void;
}

function riskDot(score: number): string {
  if (score >= 70) return "var(--red)";
  if (score >= 45) return "var(--orange)";
  if (score >= 22) return "var(--amber)";
  return "var(--green)";
}

export function Sidebar({ docs, stats, activeId, onSelect, onDelete, onNew, open, onClose }: SidebarProps) {
  return (
    <>
      {open && <div className="scrim" onClick={onClose} />}
      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="sidebar-head">
          <div className="brand">
            <LogoMark size={30} />
            <div className="brand-text">
              <span className="brand-name">DocuMind</span>
              <span className="brand-sub">analysis workspace</span>
            </div>
          </div>
          <button className="icon-btn sidebar-close" onClick={onClose} aria-label="Close sidebar">
            <IconClose size={16} />
          </button>
        </div>

        <button className="btn btn-primary btn-new" onClick={onNew}>
          <IconUpload size={16} />
          Analyze a document
        </button>

        <div className="lib-label">
          <span>Library</span>
          <span className="lib-count">{docs.length}</span>
        </div>

        <nav className="lib-list">
          {docs.length === 0 && (
            <p className="lib-empty">
              Nothing indexed yet. Drop a PDF or pick a sample — the whole RAG loop runs in your browser.
            </p>
          )}
          {docs.map((doc) => {
            const st = stats[doc.id];
            const active = doc.id === activeId;
            return (
              <button
                key={doc.id}
                className={`lib-item${active ? " active" : ""}`}
                onClick={() => onSelect(doc.id)}
                title={doc.name}
              >
                <span className={`lib-ic t-${st?.docType ?? "general"}`}>
                  <TypeIcon type={st?.docType ?? "general"} size={15} />
                </span>
                <span className="lib-meta">
                  <span className="lib-name">{doc.name}</span>
                  <span className="lib-line">
                    <i className="dot" style={{ background: riskDot(st?.riskScore ?? 0) }} />
                    {st?.chunks ?? "—"} chunks · {st?.flags ?? 0} flags
                  </span>
                </span>
                <span
                  className="lib-del"
                  role="button"
                  tabIndex={0}
                  aria-label={`Delete ${doc.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(doc.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      onDelete(doc.id);
                    }
                  }}
                >
                  <IconTrash size={13} />
                </span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <span className="db-pill">
            <IconDb size={13} />
            {DB_STATUS}
          </span>
          <span className="foot-note">
            RAG demo · pgvector schema ready · NVIDIA NIM for inference
          </span>
        </div>
      </aside>
    </>
  );
}
