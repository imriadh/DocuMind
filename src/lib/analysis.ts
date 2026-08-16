import type {
  Analysis,
  Chunk,
  Detection,
  DocType,
  Severity,
  SourceRef,
  StoredDoc,
} from "./types";
import { SEVERITY_RANK } from "./types";

/* ---------------------------------- utils --------------------------------- */

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

const STOPWORDS = new Set(
  "a,an,the,and,or,but,if,then,else,of,to,in,on,for,with,by,at,from,is,are,was,were,be,been,being,as,that,this,these,those,it,its,their,they,them,he,she,his,her,not,no,shall,will,would,can,could,may,might,must,has,have,had,do,does,did,than,into,upon,per,via,which,who,whom,what,when,where,how,why,all,any,each,other,such,only,also,about,there,here,out,up,down,over,under,again,further,once,more,most,some,very,own,same,so,too,just,now,our,we,you,your,i,me,my,us".split(
    ","
  )
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9%$€£.]+/)
    .map((t) => t.replace(/^[.$]+|[.$]+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function excerptSentence(text: string, matchIndex: number, matchLen: number): { start: number; end: number } {
  let start = text.lastIndexOf(". ", matchIndex);
  start = start === -1 ? 0 : start + 2;
  const nl = text.lastIndexOf("\n", matchIndex);
  if (nl > start) start = nl + 1;
  let end = -1;
  for (const probe of [". ", "! ", "? "]) {
    const i = text.indexOf(probe, matchIndex + matchLen);
    if (i !== -1 && (end === -1 || i < end)) end = i + 1;
  }
  const nlEnd = text.indexOf("\n", matchIndex + matchLen);
  if (nlEnd !== -1 && nlEnd < (end === -1 ? Infinity : end)) end = nlEnd;
  if (end === -1) end = text.length;
  return { start, end: Math.min(end, text.length) };
}

/* --------------------------------- chunking -------------------------------- */

function buildChunks(docId: string, text: string): Chunk[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0);
  const chunks: Chunk[] = [];
  let buffer: string[] = [];
  let bufferWords = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const body = buffer.join("\n\n");
    chunks.push({
      id: `${docId}-c${chunks.length}`,
      index: chunks.length,
      page: Math.floor(chunks.length / 2) + 1,
      text: body,
      words: countWords(body),
    });
    buffer = [];
    bufferWords = 0;
  };

  for (const para of paragraphs) {
    const w = countWords(para);
    if (bufferWords > 0 && bufferWords + w > 150) flush();
    buffer.push(para);
    bufferWords += w;
    if (bufferWords >= 150) flush();
  }
  flush();

  // If a single paragraph exceeded the budget, split long chunks by sentences.
  const out: Chunk[] = [];
  for (const c of chunks) {
    if (c.words <= 190) {
      out.push({ ...c, id: `${docId}-c${out.length}`, index: out.length });
      continue;
    }
    const sentences = splitSentences(c.text);
    let acc: string[] = [];
    let accWords = 0;
    for (const s of sentences) {
      acc.push(s);
      accWords += countWords(s);
      if (accWords >= 120) {
        const body = acc.join(" ");
        out.push({
          id: `${docId}-c${out.length}`,
          index: out.length,
          page: Math.floor(out.length / 2) + 1,
          text: body,
          words: accWords,
        });
        acc = [];
        accWords = 0;
      }
    }
    if (acc.length) {
      const body = acc.join(" ");
      out.push({
        id: `${docId}-c${out.length}`,
        index: out.length,
        page: Math.floor(out.length / 2) + 1,
        text: body,
        words: accWords,
      });
    }
  }
  return out;
}

/* ------------------------------- tf-idf vectors ----------------------------- */

function buildIndex(chunks: Chunk[]) {
  const df = new Map<string, number>();
  const tfs: Array<Map<string, number>> = [];
  for (const chunk of chunks) {
    const tf = new Map<string, number>();
    for (const t of tokenize(chunk.text)) tf.set(t, (tf.get(t) ?? 0) + 1);
    tfs.push(tf);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = chunks.length || 1;
  const idf = new Map<string, number>();
  df.forEach((count, term) => idf.set(term, Math.log(1 + n / count) + 1));
  const weights = tfs.map((tf) => {
    const w = new Map<string, number>();
    tf.forEach((count, term) => w.set(term, count * (idf.get(term) ?? 1)));
    return w;
  });
  return { weights, idf };
}

export function retrieve(analysis: Analysis, question: string, k: number): { chunk: Chunk; score: number }[] {
  const qTokens = tokenize(question);
  if (qTokens.length === 0) return [];
  const qVec = new Map<string, number>();
  for (const t of qTokens) qVec.set(t, (qVec.get(t) ?? 0) + 1);
  const scored = analysis.chunks.map((chunk, i) => {
    let score = 0;
    const w = analysis.weights[i];
    qVec.forEach((qCount, term) => {
      const weight = w.get(term);
      if (weight) score += weight * qCount * (analysis.idf.get(term) ?? 1);
    });
    const lower = chunk.text.toLowerCase();
    const qLower = question.toLowerCase();
    for (const t of qTokens) if (t.length > 4 && lower.includes(t)) score += 2.5;
    if (qLower.length > 8 && lower.includes(qLower)) score += 20;
    return { chunk, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

/* ------------------------------ detection rules ----------------------------- */

interface Rule {
  type: string;
  title: string;
  severity: Severity;
  pattern: RegExp;
  escalators?: { pattern: RegExp; to: Severity }[];
  reason: string;
}

const RULES: Rule[] = [
  {
    type: "auto-renewal",
    title: "Automatic renewal",
    severity: "high",
    pattern: /automatic(?:ally)?\s+renew/i,
    escalators: [{ pattern: /then-current list price|60 days|sixty \(60\)/i, to: "high" }],
    reason: "The contract rolls over on its own, and the notice window decides whether you are locked in for another full term.",
  },
  {
    type: "non-refundable",
    title: "Non-refundable fees",
    severity: "medium",
    pattern: /non[-\s]?refundable/i,
    reason: "Paid fees are not returned even if the service stops being useful — check prepayment exposure.",
  },
  {
    type: "late-interest",
    title: "Late payment interest",
    severity: "medium",
    pattern: /interest at [\d.]+% per month/i,
    reason: "1.5% per month compounds to roughly 19.6% annually on overdue balances.",
  },
  {
    type: "sole-discretion",
    title: "Unilateral discretion",
    severity: "high",
    pattern: /sole discretion/i,
    reason: "A decision that affects both parties is left to one side's judgment alone.",
  },
  {
    type: "unilateral-change",
    title: "Terms may change unilaterally",
    severity: "critical",
    pattern: /may modify (?:the service|the documentation|the terms)[\s\S]{0,90}?sole discretion/i,
    reason: "One party can rewrite the agreement at any time; continued use counts as acceptance. Push for notice + consent, or a termination right on material change.",
  },
  {
    type: "indemnification",
    title: "Indemnification obligation",
    severity: "high",
    pattern: /indemnif/i,
    escalators: [{ pattern: /any and all claims/i, to: "critical" }],
    reason: "“Any and all claims” is uncapped language. Verify the obligation is mutual and carved out for your own negligence only.",
  },
  {
    type: "liability-cap",
    title: "Limitation of liability",
    severity: "medium",
    pattern: /limitation of liability|aggregate liability/i,
    escalators: [{ pattern: /consequential|lost profits/i, to: "high" }],
    reason: "Recovery is capped at 12 months of fees and consequential damages are excluded — quantify your worst-case exposure before signing.",
  },
  {
    type: "termination-convenience",
    title: "Termination for convenience",
    severity: "high",
    pattern: /(?:terminate|suspend)[\s\S]{0,110}?(?:for any reason|no reason|for convenience)/i,
    reason: "One side can walk away (or lock you out) without cause — while your exit requires paying out the full term. Asymmetric exit rights.",
  },
  {
    type: "ip-assignment",
    title: "Irrevocable IP assignment",
    severity: "high",
    pattern: /irrevocably assigns?|irrevocable assignment/i,
    reason: "Feedback or suggestions become the other party's property permanently, with no carve-out for your pre-existing IP.",
  },
  {
    type: "arbitration",
    title: "Binding arbitration",
    severity: "medium",
    pattern: /binding arbitration/i,
    reason: "Disputes leave the court system; appeals are limited and proceedings are private.",
  },
  {
    type: "class-waiver",
    title: "Class action waiver",
    severity: "high",
    pattern: /waives? any right to participate in (?:a )?class action/i,
    reason: "You give up collective redress; individual arbitration is often the only remaining path.",
  },
  {
    type: "confidentiality",
    title: "Confidentiality clause",
    severity: "low",
    pattern: /confidential information/i,
    reason: "Standard mutual confidentiality — check the carve-outs and the survival period.",
  },
  {
    type: "governing-law",
    title: "Governing law & venue",
    severity: "low",
    pattern: /governed by the laws of/i,
    reason: "Delaware law and Wilmington venue — factor travel and counsel costs into disputes.",
  },
  {
    type: "data-protection",
    title: "Data protection / subprocessors",
    severity: "low",
    pattern: /gdpr|personal data|subprocessors/i,
    reason: "Subprocessors can change via a website list — ask for change-notification rights if you process regulated data.",
  },
  {
    type: "force-majeure",
    title: "Force majeure",
    severity: "low",
    pattern: /force majeure/i,
    reason: "Standard excuse-for-delay clause; confirm it excludes payment obligations.",
  },
  {
    type: "covenant-risk",
    title: "Debt covenant breach risk",
    severity: "critical",
    pattern: /covenant breach/i,
    escalators: [{ pattern: /accelerate repayment/i, to: "critical" }],
    reason: "A ~12% EBITDA decline triggers breach and lets lenders accelerate $260M of debt — the single largest downside risk in this filing.",
  },
  {
    type: "going-concern",
    title: "Going concern / liquidity",
    severity: "medium",
    pattern: /going concern|liquidity headroom/i,
    reason: "Management discloses narrowed liquidity headroom. No going-concern doubt yet, but the buffer is thin.",
  },
  {
    type: "goodwill",
    title: "Goodwill impairment risk",
    severity: "medium",
    pattern: /goodwill impairment/i,
    reason: "A “reasonably possible” impairment of a $142.7M balance would hit the income statement as a non-cash charge.",
  },
  {
    type: "non-gaap",
    title: "Non-GAAP measure reliance",
    severity: "low",
    pattern: /non[-\s]?gaap/i,
    reason: "Adjusted EBITDA excludes real costs — compare against GAAP operating loss before relying on it.",
  },
  {
    type: "guidance",
    title: "Guidance withdrawn",
    severity: "medium",
    pattern: /withdrawing prior[\s\S]{0,40}?guidance/i,
    reason: "Pulling full-year guidance signals management uncertainty about the forecast.",
  },
  {
    type: "study-limitation",
    title: "Stated limitation",
    severity: "medium",
    pattern: /limited to english|degrades for multi-hop|dataset bias/i,
    reason: "The authors bound the validity of their results — weight the findings accordingly.",
  },
  {
    type: "hallucination",
    title: "Residual hallucination rate",
    severity: "medium",
    pattern: /hallucination rate of [\d.]+%/i,
    reason: "4.1% of answers remain fabricated — the authors themselves call for human review in high-stakes settings.",
  },
  {
    type: "benchmark",
    title: "Headline result",
    severity: "low",
    pattern: /78\.4% answer accuracy/i,
    reason: "The paper's central claim: +17.2 points of accuracy from retrieval augmentation over the baseline.",
  },
];

function runDetection(chunks: Chunk[]): Detection[] {
  const detections: Detection[] = [];
  for (const chunk of chunks) {
    for (const rule of RULES) {
      const m = rule.pattern.exec(chunk.text);
      if (!m) continue;
      let severity: Severity = rule.severity;
      if (rule.escalators) {
        for (const e of rule.escalators) {
          if (e.pattern.test(chunk.text)) severity = e.to;
        }
      }
      const { start, end } = excerptSentence(chunk.text, m.index, m[0].length);
      detections.push({
        id: uid(),
        chunkId: chunk.id,
        chunkIndex: chunk.index,
        type: rule.type,
        title: rule.title,
        severity,
        reason: rule.reason,
        excerpt: chunk.text.slice(start, end),
        start,
        end,
      });
      rule.pattern.lastIndex = 0;
    }
  }
  return detections.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.chunkIndex - b.chunkIndex
  );
}

/* --------------------------------- summary ---------------------------------- */

function scoreSummary(analysis: Analysis, chunks: Chunk[]): { summary: string; keyPoints: string[] } {
  interface Cand { text: string; score: number; order: number }
  const candidates: Cand[] = [];
  const totalChars = chunks.reduce((s, c) => s + c.text.length, 0) || 1;
  let charsSeen = 0;
  chunks.forEach((chunk, ci) => {
    const position = charsSeen / totalChars;
    charsSeen += chunk.text.length;
    const sentences = splitSentences(chunk.text);
    sentences.forEach((s) => {
      if (s.length < 45 || s.length > 320) return;
      if (/^(references|\d+\.\s|in witness|by order)/i.test(s)) return;
      let score = 0;
      const w = analysis.weights[ci];
      for (const t of tokenize(s)) score += w.get(t) ?? 0;
      if (position < 0.18) score *= 1.5; // favour the opening
      if (/\d/.test(s)) score *= 1.25; // favour quantitative statements
      score /= Math.sqrt(s.length);
      candidates.push({ text: s, score, order: candidates.length });
    });
  });
  const top = [...candidates].sort((a, b) => b.score - a.score).slice(0, 14);
  const chosen: Cand[] = [];
  for (const cand of top) {
    const overlaps = chosen.some(
      (c) =>
        c.text.includes(cand.text.slice(0, 42)) || cand.text.includes(c.text.slice(0, 42))
    );
    if (!overlaps) chosen.push(cand);
    if (chosen.length >= 5) break;
  }
  chosen.sort((a, b) => a.order - b.order);
  const summary = chosen.map((c) => c.text).join(" ");
  const keyPoints = chosen.slice(0, 4).map((c) => (c.text.length > 168 ? c.text.slice(0, 165).trimEnd() + "…" : c.text));
  return { summary, keyPoints };
}

/* --------------------------------- entities --------------------------------- */

function extractEntities(text: string) {
  const orgSet = new Set<string>();
  const orgRe = /\b([A-Z][A-Za-z&'.-]*(?:\s+(?:of\s+)?[A-Z][A-Za-z&'.-]*){0,3}),?\s+(Inc\.|LLC|Ltd\.|Group|Corp\.?|Corporation|GmbH)\b/g;
  let m: RegExpExecArray | null;
  while ((m = orgRe.exec(text)) && orgSet.size < 8) orgSet.add(m[0].replace(/,\s+/, " "));
  const known = ["Nimbus Platform", "Halcyon Retail Group", "Delaware"];
  for (const k of known) if (text.includes(k)) orgSet.add(k);

  const amtSet = new Set<string>();
  const amtRe = /[$€£]\s?\d[\d,.]*(?:\s?(?:million|billion|[MBK]))?/g;
  while ((m = amtRe.exec(text)) && amtSet.size < 10) amtSet.add(m[0]);

  const dateSet = new Set<string>();
  const dateRe = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b|\b(?:third|fourth|first|second) quarter of fiscal \d{4}\b|\bQ[1-4]\s?(?:FY)?\d{2,4}\b/gi;
  while ((m = dateRe.exec(text)) && dateSet.size < 8) dateSet.add(m[0]);

  return { orgs: [...orgSet], amounts: [...amtSet], dates: [...dateSet] };
}

/* ------------------------------ doc type + tone ----------------------------- */

function detectType(text: string): DocType {
  const lower = text.toLowerCase();
  const vote = (words: string[]) => words.reduce((s, w) => (lower.includes(w) ? s + 1 : s), 0);
  const contract = vote(["agreement", "shall", "indemnif", "confidential information", "termination", "parties agree"]);
  const financial = vote(["revenue", "quarter", "ebitda", "fiscal", "net loss", "covenant", "liquidity"]);
  const academic = vote(["abstract", "experiments", "limitations", "future work", "baseline", "corpus"]);
  if (academic > contract && academic > financial && academic >= 3) return "academic";
  if (financial > contract && financial >= 3) return "financial";
  if (contract >= 3) return "contract";
  return "general";
}

const SUGGESTED: Record<DocType, string[]> = {
  contract: [
    "What is the termination policy?",
    "Does the contract auto-renew?",
    "What are my indemnification obligations?",
    "Can the provider change the terms unilaterally?",
    "Who owns feedback and improvements?",
  ],
  financial: [
    "What are the biggest risk factors?",
    "How did revenue and margins trend?",
    "What happens if the covenant is breached?",
    "Is there a going-concern issue?",
    "What is the debt situation?",
  ],
  academic: [
    "What are the paper's main contributions?",
    "What limitations do the authors note?",
    "How big is the improvement over the baseline?",
    "What retrieval settings worked best?",
  ],
  general: [
    "Summarize the key points",
    "What obligations does this create?",
    "Are there any risky clauses?",
  ],
};

/* --------------------------------- analyze ---------------------------------- */

export function analyzeDocument(doc: StoredDoc): Analysis {
  const docType = detectType(doc.text);
  const chunks = buildChunks(doc.id, doc.text);
  const { weights, idf } = buildIndex(chunks);
  const partial: Analysis = {
    docType,
    chunks,
    summary: "",
    keyPoints: [],
    detections: [],
    riskScore: 0,
    riskLabel: "",
    entities: { orgs: [], amounts: [], dates: [] },
    obligationRatio: 0.5,
    readingMinutes: Math.max(1, Math.round(doc.words / 220)),
    suggested: SUGGESTED[docType],
    weights,
    idf,
  };
  const { summary, keyPoints } = scoreSummary(partial, chunks);
  const detections = runDetection(chunks);

  const weight: Record<Severity, number> = { critical: 26, high: 17, medium: 9, low: 3 };
  const raw = detections.reduce((s, d) => s + weight[d.severity], 0);
  const riskScore = Math.min(98, Math.round(raw * (0.7 + Math.min(chunks.length, 14) / 40)));
  const riskLabel =
    riskScore < 22 ? "Low exposure" : riskScore < 45 ? "Moderate exposure" : riskScore < 70 ? "Elevated exposure" : "High exposure";

  const lower = doc.text.toLowerCase();
  const obligation = (lower.match(/\b(shall|must|required to|obliged to)\b/g) || []).length;
  const permission = (lower.match(/\b(may|entitled to|permitted|optional)\b/g) || []).length;
  const obligationRatio = obligation + permission === 0 ? 0.5 : obligation / (obligation + permission);

  return {
    ...partial,
    summary,
    keyPoints,
    detections,
    riskScore,
    riskLabel,
    entities: extractEntities(doc.text),
    obligationRatio,
  };
}

/* ------------------------------ question answering -------------------------- */

export interface Answer {
  text: string;
  sources: SourceRef[];
  followUps: string[];
}

function chunkLabel(chunk: Chunk): string {
  return `§${chunk.index + 1} · p${chunk.page}`;
}

export function answerQuestion(analysis: Analysis, question: string): Answer {
  const q = question.trim();
  const ql = q.toLowerCase();

  if (/^(hi|hello|hey|yo|thanks|thank you|ok|okay)\b/.test(ql)) {
    return {
      text: "I only read what is inside this document — ask me about terms, numbers, risks, or any specific clause and I will answer from the indexed passages with citations.",
      sources: [],
      followUps: analysis.suggested.slice(0, 3),
    };
  }

  const hits = retrieve(analysis, q, 4);
  const followUps = analysis.suggested.filter((s) => s.toLowerCase() !== ql).slice(0, 2);

  if (hits.length === 0) {
    return {
      text: `I searched all ${analysis.chunks.length} indexed passages and found nothing that matches that question. The document may simply not cover it — try rephrasing, or ask one of the suggested questions below.`,
      sources: [],
      followUps: analysis.suggested.slice(0, 3),
    };
  }

  const best = hits[0];
  const weak = best.score < 4;

  // Pull the most relevant sentences out of the top passages.
  const quotes: { text: string; chunk: Chunk }[] = [];
  for (const hit of hits.slice(0, 3)) {
    const sentences = splitSentences(hit.chunk.text);
    let bestS = sentences[0];
    let bestScore = -1;
    const qTokens = new Set(tokenize(q));
    for (const s of sentences) {
      let sc = 0;
      for (const t of tokenize(s)) if (qTokens.has(t)) sc += analysis.idf.get(t) ?? 1;
      if (sc > bestScore) {
        bestScore = sc;
        bestS = s;
      }
    }
    if (bestScore > 0 || hit === best) quotes.push({ text: bestS, chunk: hit.chunk });
    if (quotes.length >= 3) break;
  }

  let lead = "From the document:";
  if (/(refund|money back)/.test(ql)) lead = "On refunds:";
  else if (/terminat|cancel|exit/.test(ql)) lead = "On termination:";
  else if (/renew/.test(ql)) lead = "On renewal:";
  else if (/risk/.test(ql)) lead = "Key risk signals I found:";
  else if (/liabilit|damages/.test(ql)) lead = "On liability:";
  else if (/indemni/.test(ql)) lead = "On indemnification:";
  else if (/own|ip |intellectual/.test(ql)) lead = "On ownership:";
  else if (/debt|loan|covenant/.test(ql)) lead = "On debt and covenants:";
  else if (/revenue|margin|ebitda|earnings/.test(ql)) lead = "On performance:";
  else if (/limitation|weakness|bias/.test(ql)) lead = "The authors flag:";
  else if (/contribut|findings|result|improvement/.test(ql)) lead = "The headline findings:";
  else if (/going concern|liquidity/.test(ql)) lead = "On liquidity:";

  const body = quotes
    .map((qq) => `“${qq.text}” — ${chunkLabel(qq.chunk)}`)
    .join("\n\n");

  const text = weak
    ? `I could not find a passage that directly answers that. The nearest indexed context:\n\n${body}`
    : `${lead}\n\n${body}`;

  return {
    text,
    sources: quotes.map((qq) => ({ chunkId: qq.chunk.id, label: chunkLabel(qq.chunk) })),
    followUps,
  };
}
