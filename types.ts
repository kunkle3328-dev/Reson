
export type SourceType = 'pdf' | 'text' | 'url' | 'file' | 'derived';

export type IntelligencePhase =
  | "idle"
  | "listening"
  | "thinking"
  | "synthesizing"
  | "speaking"
  | "reflecting"
  | "generating-audio"
  | "explaining"
  | "error";

export type VoiceRole = "narrator" | "analyst";

export interface AudioSegment {
  id: string;
  text: string;
  voice: VoiceRole;
  chapterId: string;
}

export interface AudioChapter {
  id: string;
  title: string;
  startTime: number;
  summary: string;
}

export interface AudioOverview {
  segments: AudioSegment[];
  chapters: AudioChapter[];
  durationEstimate: string;
}

export interface IntelligenceSignal {
  phase: IntelligencePhase;
  intensity: number;
  confidence: number;
  interruptible: boolean;
  transcript: string;
  partialTranscript: string;
}

export interface IntelligenceState extends IntelligenceSignal {
  synthesisProgress: number; 
  lastUtteranceTs: number;
}

export type IntelligenceAction =
  | { type: "SIGNAL_PHASE"; payload: IntelligencePhase }
  | { type: "SIGNAL_INTENSITY"; payload: number }
  | { type: "SIGNAL_CONFIDENCE"; payload: number }
  | { type: "SIGNAL_TRANSCRIPT"; payload: string; partial?: boolean }
  | { type: "SIGNAL_PROGRESS"; payload: number }
  | { type: "SIGNAL_INTERRUPT" }
  | { type: "SIGNAL_RESET" };

export interface Source {
  id: string;
  type: SourceType;
  title: string;
  content: string;
  notebookId: string;
  createdAt: number;
  url?: string;
  isDerived?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface Reflection {
  id: string;
  type: 'micro' | 'daily' | 'weekly' | 'cross-notebook';
  title: string;
  content: string;
  timestamp: number;
  openThread?: string;
  clarifiedIdea?: string;
}

export interface DiscoveryResult {
  title: string;
  url: string;
  snippet: string;
  relevance: string;
}

export interface Hypothesis {
  id: string;
  statement: string;
  confidence: number;
  status: 'forming' | 'evolving' | 'confirmed' | 'discarded';
  evidence: {
    notebookId: string;
    noteId: string;
  }[];
  createdAt: number;
  updatedAt: number;
}

export interface TimelineEvent {
  id: string;
  timestamp: number;
  dateString: string;
  label: string;
  summary: string;
}

export interface Notebook {
  id: string;
  name: string;
  createdAt: number;
  overview?: string;
  reflections?: Reflection[];
  hypotheses?: Hypothesis[];
  timeline?: TimelineEvent[];
  audioOverview?: AudioOverview;
}

export interface AppState {
  notebooks: Notebook[];
  sources: Source[];
  activeNotebookId: string | null;
  messages: Record<string, ChatMessage[]>;
}

export interface SynthesisResult {
  briefing: string;
  reflections: Omit<Reflection, 'id' | 'timestamp'>[];
  hypotheses: Omit<Hypothesis, 'id' | 'createdAt' | 'updatedAt'>[];
  timeline: Omit<TimelineEvent, 'id'>[];
  audioOverview?: AudioOverview;
}
