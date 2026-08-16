export type DocType = "contract" | "financial" | "academic" | "general";
export type Severity = "low" | "medium" | "high" | "critical";
export type FileKind = "pdf" | "text";

export interface StoredDoc {
  id: string;
  name: string;
  kind: FileKind;
  text: string;
  addedAt: number;
  words: number;
}

export interface Chunk {
  id: string;
  index: number;
  page: number;
  text: string;
  words: number;
}

export interface Detection {
  id: string;
  chunkId: string;
  chunkIndex: number;
  type: string;
  title: string;
  severity: Severity;
  reason: string;
  excerpt: string;
  start: number; // offset inside chunk text
  end: number;
}

export interface DocEntities {
  orgs: string[];
  amounts: string[];
  dates: string[];
}

export interface Analysis {
  docType: DocType;
  chunks: Chunk[];
  summary: string;
  keyPoints: string[];
  detections: Detection[];
  riskScore: number;
  riskLabel: string;
  entities: DocEntities;
  obligationRatio: number; // 0..1 — share of obligation language vs permission language
  readingMinutes: number;
  suggested: string[];
  weights: Array<Map<string, number>>; // per-chunk tf-idf vectors
  idf: Map<string, number>;
}

export interface SourceRef {
  chunkId: string;
  label: string;
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: SourceRef[];
  followUps?: string[];
  at: number;
}

export interface PipelineStepState {
  key: string;
  label: string;
  tech: string;
  state: "pending" | "running" | "done";
  detail?: string;
}

export interface PipelineState {
  docId: string;
  docName: string;
  steps: PipelineStepState[];
  logs: string[];
  progress: number;
}

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

export interface DocStats {
  flags: number;
  riskScore: number;
  chunks: number;
  docType: DocType;
}

export const SEVERITY_RANK: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "Informational",
  medium: "Review",
  high: "Negotiate",
  critical: "Red flag",
};
