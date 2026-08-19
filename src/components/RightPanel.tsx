import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Analysis, ChatMsg, Detection, StoredDoc } from "../lib/types";
import { SEVERITY_LABEL } from "../lib/types";
import { answerQuestion, uid } from "../lib/analysis";
import {
  IconChat,
  IconClose,
  IconSearch,
  IconSend,
  IconShield,
  IconSummary,
} from "./icons";

export type PanelTab = "overview" | "clauses" | "chat";

interface RightPanelProps {
  doc: StoredDoc;
  analysis: Analysis;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  thread: ChatMsg[];
  onThreadChange: (msgs: ChatMsg[]) => void;
  onJumpToChunk: (chunkId: string) => void;
  onClose?: () => void;
}

const TABS: { key: PanelTab; label: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { key: "overview", label: "TL;DR", icon: (p) => <IconSummary {...p} /> },
  { key: "clauses", label: "Clauses", icon: (p) => <IconShield {...p} /> },
  { key: "chat", label: "Chat", icon: (p) => <IconChat {...p} /> },
];

function scoreColor(score: number): string {
  if (score >= 70) return "var(--red)";
  if (score >= 45) return "var(--orange)";
  if (score >= 22) return "var(--amber)";
  return "var(--green)";
}

export function RightPanel({
  doc,
  analysis,
  tab,
  onTab,
  thread,
  onThreadChange,
  onJumpToChunk,
  onClose,
}: RightPanelProps) {
  const [messages, setMessages] = useState<ChatMsg[]>(thread);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [gaugeOn, setGaugeOn] = useState(false);
  const timers = useRef<number[]>([]);
  const chatScroll = useRef<HTMLDivElement>(null);
  const baseRef = useRef<ChatMsg[]>(thread);

  /* reset conversation view when switching documents */
  useEffect(() => {
    baseRef.current = thread;
    setMessages(thread);
    setThinking(false);
    timers.current.forEach((t) => window.clearInterval(t));
    timers.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  useEffect(() => {
    setGaugeOn(false);
    const raf = requestAnimationFrame(() => setGaugeOn(true));
    return () => cancelAnimationFrame(raf);
  }, [analysis]);

  useEffect(() => {
    return () => timers.current.forEach((t) => window.clearInterval(t));
  }, []);

  useEffect(() => {
    if (chatScroll.current) chatScroll.current.scrollTop = chatScroll.current.scrollHeight;
  }, [messages.length, thinking]);

  const send = (raw?: string) => {
    const q = (raw ?? input).trim();
    if (!q || thinking) return;
    setInput("");
    const userMsg: ChatMsg = { id: uid(), role: "user", text: q, at: Date.now() };
    baseRef.current = [...baseRef.current, userMsg];
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setThinking(true);

    let ticks = 0;
    let streamed = "";
    const answer = answerQuestion(analysis, q);
    const asstId = uid();

    const interval = window.setInterval(() => {
      ticks += 1;
      if (ticks < 5) return; // "retrieving passages" beat
      if (streamed.length === 0) {
        setMessages((prev) => [
          ...prev,
          { id: asstId, role: "assistant", text: "", sources: answer.sources, followUps: answer.followUps, at: Date.now() },
        ]);
      }
      streamed = answer.text.slice(0, streamed.length + 3);
      const snapshot = streamed;
      const done = snapshot.length >= answer.text.length;
      setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, text: snapshot } : m)));
      if (done) {
        window.clearInterval(interval);
        setThinking(false);
        const finalMsg: ChatMsg = {
          id: asstId,
          role: "assistant",
          text: answer.text,
          sources: answer.sources,
          followUps: answer.followUps,
          at: Date.now(),
        };
        baseRef.current = [...baseRef.current, finalMsg];
        onThreadChange(baseRef.current);
      }
    }, 55);
    timers.current.push(interval);
  };

  const sevCounts = { low: 0, medium: 0, high: 0, critical: 0 } as Record<string, number>;
  for (const d of analysis.detections) sevCounts[d.severity] += 1;

  const lastMsg = messages[messages.length - 1];
  const arcLen = Math.PI * 80;

  return (
    <aside className="rpanel">
      <div className="rp-head">
        <div className="rp-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`rp-tab${tab === t.key ? " active" : ""}`} onClick={() => onTab(t.key)}>
              {t.icon({ size: 14 })}
              {t.label}
              {t.key === "clauses" && analysis.detections.length > 0 && (
                <span className="tab-badge">{analysis.detections.length}</span>
              )}
            </button>
          ))}
        </div>
        {onClose && (
          <button className="icon-btn rp-close" onClick={onClose} aria-label="Close insights panel">
            <IconClose size={15} />
          </button>
        )}
      </div>

      {tab === "overview" && (
        <div className="rp-scroll rp-overview">
          <div className="tldr-block">
            <h2 className="tldr-title">
              TL;DR
              <svg className="swipe swipe-sm" viewBox="0 0 220 14" preserveAspectRatio="none" aria-hidden>
                <path d="M3 10 C 60 3, 150 2, 217 7" stroke="#F0E14E" strokeWidth="6" strokeLinecap="round" fill="none" />
              </svg>
            </h2>
            <p className="tldr-text">{analysis.summary || "Not enough text to summarize."}</p>
          </div>

          <div className="gauge-card">
            <div className="gauge">
              <svg viewBox="0 0 200 112" aria-hidden>
                <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--line)" strokeWidth="13" strokeLinecap="round" />
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke={scoreColor(analysis.riskScore)}
                  strokeWidth="13"
                  strokeLinecap="round"
                  strokeDasharray={`${(gaugeOn ? analysis.riskScore : 0) / 100 * arcLen} ${arcLen}`}
                  style={{ transition: "stroke-dasharray 1s cubic-bezier(.22,1,.36,1)" }}
                />
              </svg>
              <div className="gauge-num">
                <strong>{analysis.riskScore}</strong>
                <span>/ 100</span>
              </div>
            </div>
            <div className="gauge-label" style={{ color: scoreColor(analysis.riskScore) }}>
              {analysis.riskLabel}
            </div>
            <div className="sev-row">
              {(["critical", "high", "medium", "low"] as const).map((sev) => (
                <button key={sev} className="sev-count" onClick={() => onTab("clauses")} title={`${SEVERITY_LABEL[sev]} — open clause list`}>
                  <i className={`dot sev-dot-${sev}`} />
                  {sevCounts[sev]} <em>{sev}</em>
                </button>
              ))}
            </div>
          </div>

          {analysis.keyPoints.length > 0 && (
            <div className="rp-section">
              <h3 className="rp-h">Key takeaways</h3>
              <ul className="takeaways">
                {analysis.keyPoints.map((k, i) => (
                  <li key={i} style={{ animationDelay: `${i * 70}ms` }}>
                    <span className="tk-idx">{String(i + 1).padStart(2, "0")}</span>
                    {k}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rp-section">
            <h3 className="rp-h">Language balance</h3>
            <div className="tone-bar">
              <div className="tone-fill" style={{ width: `${Math.round(analysis.obligationRatio * 100)}%` }} />
            </div>
            <div className="tone-legend">
              <span><i className="dot" style={{ background: "var(--hl)" }} />obligations {Math.round(analysis.obligationRatio * 100)}%</span>
              <span>permissions {100 - Math.round(analysis.obligationRatio * 100)}%</span>
            </div>
            <p className="tone-note">Share of “shall / must” versus “may / entitled” phrasing across the full text.</p>
          </div>

          {(analysis.entities.amounts.length > 0 || analysis.entities.orgs.length > 0) && (
            <div className="rp-section">
              <h3 className="rp-h">Entities pulled</h3>
              {analysis.entities.amounts.length > 0 && (
                <div className="ent-group">
                  <span className="ent-label">Amounts</span>
                  <div className="chips">
                    {analysis.entities.amounts.map((a) => (
                      <code key={a} className="chip chip-money">{a}</code>
                    ))}
                  </div>
                </div>
              )}
              {analysis.entities.orgs.length > 0 && (
                <div className="ent-group">
                  <span className="ent-label">Parties</span>
                  <div className="chips">
                    {analysis.entities.orgs.map((o) => (
                      <span key={o} className="chip">{o}</span>
                    ))}
                  </div>
                </div>
              )}
              {analysis.entities.dates.length > 0 && (
                <div className="ent-group">
                  <span className="ent-label">Dates</span>
                  <div className="chips">
                    {analysis.entities.dates.slice(0, 5).map((d) => (
                      <span key={d} className="chip">{d}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="rp-section stats-grid">
            <div className="stat"><strong>{analysis.chunks.length}</strong><span>chunks indexed</span></div>
            <div className="stat"><strong>{analysis.readingMinutes} min</strong><span>manual read</span></div>
            <div className="stat"><strong>~20 s</strong><span>with DocuMind</span></div>
          </div>
        </div>
      )}

      {tab === "clauses" && (
        <div className="rp-scroll rp-clauses">
          <div className="cl-head">
            <h2 className="rp-h2">Flagged clauses</h2>
            <p>
              {analysis.detections.length === 0
                ? "The clause scan came back clean — nothing in this document matched a risk pattern."
                : `${analysis.detections.length} passages matched risk patterns. Click any flag to jump to it in the text.`}
            </p>
          </div>
          {analysis.detections.length === 0 ? (
            <div className="cl-empty">
              <IconShield size={34} />
              <strong>No flags raised</strong>
              <span>This genre of document rarely trips the scanner, or the text is unusually benign.</span>
            </div>
          ) : (
            <ol className="cl-list">
              {analysis.detections.map((d: Detection, i) => (
                <li key={d.id} className="cl-item" style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
                  <div className="cl-top">
                    <span className={`sev-pill sev-${d.severity}`}>{SEVERITY_LABEL[d.severity]}</span>
                    <strong>{d.title}</strong>
                    <span className="cl-rank">#{i + 1}</span>
                  </div>
                  <blockquote className="cl-excerpt">“{d.excerpt}”</blockquote>
                  <p className="cl-reason">{d.reason}</p>
                  <button className="link-btn cl-jump" onClick={() => onJumpToChunk(d.chunkId)}>
                    <IconSearch size={12} /> §{d.chunkIndex + 1} · page {Math.floor(d.chunkIndex / 2) + 1}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {tab === "chat" && (
        <div className="rp-chat">
          <div className="chat-list" ref={chatScroll}>
            {messages.length === 0 && (
              <div className="chat-empty">
                <p className="chat-empty-title">Ask the document anything.</p>
                <p className="chat-empty-sub">
                  Answers are synthesized only from retrieved passages of{" "}
                  <em>{doc.name}</em> — with citations you can jump to.
                </p>
                <div className="suggest">
                  {analysis.suggested.slice(0, 4).map((s) => (
                    <button key={s} className="sug-chip" onClick={() => send(s)} disabled={thinking}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`msg msg-${m.role}`}>
                {m.role === "assistant" && <span className="msg-who">DocuMind</span>}
                <div className="msg-bubble">
                  {m.text.split("\n\n").map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                  {m.role === "assistant" && m.text.length > 0 && thinking && m === lastMsg && (
                    <span className="stream-caret" />
                  )}
                </div>
                {m.role === "assistant" && m.sources && m.sources.length > 0 && m.text.length > 0 && (
                  <div className="msg-srcs">
                    <span className="src-label">sources</span>
                    {m.sources.map((s, i) => (
                      <button key={`${s.chunkId}-${i}`} className="src-chip" onClick={() => onJumpToChunk(s.chunkId)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {thinking && (lastMsg?.role === "user" || messages.length === 0) && (
              <div className="msg msg-assistant">
                <span className="msg-who">DocuMind</span>
                <div className="msg-bubble thinking-dots">
                  <i /><i /><i />
                  <span>retrieving passages…</span>
                </div>
              </div>
            )}
          </div>

          {lastMsg?.role === "assistant" && lastMsg.followUps && lastMsg.followUps.length > 0 && !thinking && (
            <div className="suggest suggest-follow">
              {lastMsg.followUps.map((f) => (
                <button key={f} className="sug-chip" onClick={() => send(f)} disabled={thinking}>
                  {f}
                </button>
              ))}
            </div>
          )}

          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Question about “${doc.name.slice(0, 28)}${doc.name.length > 28 ? "…" : ""}”`}
              aria-label="Ask a question about the document"
            />
            <button type="submit" className="send-btn" disabled={!input.trim() || thinking} aria-label="Send question">
              <IconSend size={16} />
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
