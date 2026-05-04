import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

function handleError(e: unknown): never {
  if (axios.isAxiosError(e)) throw new Error(e.response?.data?.detail || e.message);
  throw e;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function unwrap<T>(env: ApiEnvelope<T>): T {
  if (!env.success || env.data === undefined) throw new Error(env.error || "API error");
  return env.data;
}


// Legacy type alias for AnalysisPanel compatibility
export interface AnalyzeResponse {
  best_move: string | null;
  second_best_move?: string | null;
  evaluation: string | number | null;
  mate_in?: number | null;
  mateIn?: number | null;
  depth?: number;
  pv?: string[];
  top_moves?: Array<{ move: string; evaluation: string | number; mate_in?: number | null }>;
  explanation?: string;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type MoveClassification =
  | "Brilliant" | "Great" | "Best" | "Excellent" | "Good"
  | "Book" | "Inaccuracy" | "Mistake" | "Blunder" | "Missed Win";

export const CLASSIFICATION_META: Record<MoveClassification, { label: string; color: string; icon: string }> = {
  Brilliant: { label: "Brilliant!", color: "#00D4FF", icon: "✨" },
  Great: { label: "Great Move", color: "#22C55E", icon: "★" },
  Best: { label: "Best Move", color: "#22C55E", icon: "★" },
  Excellent: { label: "Excellent", color: "#10B981", icon: "✓" },
  Good: { label: "Good", color: "#6EE7B7", icon: "✓" },
  Book: { label: "Book", color: "#8B5CF6", icon: "📖" },
  Inaccuracy: { label: "Inaccuracy", color: "#F59E0B", icon: "?!" },
  Mistake: { label: "Mistake", color: "#F97316", icon: "?" },
  Blunder: { label: "Blunder", color: "#EF4444", icon: "??" },
  "Missed Win": { label: "Missed Win", color: "#DC2626", icon: "⚠" },
};

export interface MoveAnalysis {
  move_uci: string;
  move_san: string;
  ply: number;
  classification: MoveClassification;
  eval_before: number | null;
  eval_after: number | null;
  centipawn_loss: number;
  best_move_uci: string;
  best_move_san: string;
  pv_line: string[];
  insight: string;
  is_book: boolean;
  is_brilliant: boolean;
}

export interface GameSummary {
  accuracy_white: number;
  accuracy_black: number;
  best_streak: number;
  best_streak_white?: number;
  best_streak_black?: number;
  total_moves: number;
  blunders: number;
  blunders_white?: number;
  blunders_black?: number;
  mistakes: number;
  inaccuracies: number;
  opening_name: string;
}

export interface GameAnalysisResponse {
  moves: MoveAnalysis[];
  summary: GameSummary;
}

export interface HistoryGame {
  id: string;
  pgn: string;
  result: string;
  created_at: string;
  date?: string;
  moves: MoveAnalysis[];
  summary: GameSummary;
}

export interface Challenge {
  id: string;
  fen: string;
  best_move: string;
  best_move_san: string;
  evaluation: string;
  theme: string;
  theme_label: string;
  theme_description: string;
  difficulty: "easy" | "medium" | "hard";
  pv_line: string[];
  generated: boolean;
  hints?: string[];
}

export interface ChallengeValidation {
  correct: boolean;
  best_move: string;
  best_move_san: string;
  user_eval: number;
  best_eval: number;
  classification: MoveClassification;
  message: string;
  insight: string;
  line: string[];
  attempts: number;
  centipawn_loss: number;
}

// ── API calls ──────────────────────────────────────────────────────────────────

export async function analyzeMoveContext(
  fen_before: string, move_uci: string, ply: number, depth: number, skill_level: number
): Promise<MoveAnalysis> {
  try {
    const res = await api.post<ApiEnvelope<MoveAnalysis>>("/analyze-move", { fen_before, move_uci, ply, depth, skill_level });
    return unwrap(res.data);
  } catch (e) { handleError(e); }
}

export async function getEvaluationFromBackend(fen: string, depth: number, skill_level: number) {
  try {
    const res = await api.post("/analyze", { fen, depth, skill_level });
    return res.data;
  } catch (e) { handleError(e); }
}

export async function getChallenge(difficulty: string): Promise<Challenge> {
  try {
    const res = await api.get<Challenge>(`/challenge?difficulty=${difficulty}`);
    return res.data;
  } catch (e) { handleError(e); }
}

export async function validateChallenge(
  fen: string, move: string, difficulty: string, attempts: number,
  best_move_san?: string, theme?: string
): Promise<ChallengeValidation> {
  try {
    const res = await api.post<ApiEnvelope<ChallengeValidation>>("/challenge/validate", {
      fen, move, difficulty, attempts, best_move_san: best_move_san || "", theme: theme || ""
    });
    return unwrap(res.data);
  } catch (e) { handleError(e); }
}

export async function getChallengeHint(
  puzzle_id: string, current_level: number,
  fen?: string, theme?: string, difficulty?: string, best_move_san?: string
): Promise<{ hint: string }> {
  try {
    const res = await api.post<{ hint: string }>("/challenge/hint", {
      puzzle_id, current_level,
      fen: fen || "", theme: theme || "", difficulty: difficulty || "medium", best_move_san: best_move_san || ""
    });
    return res.data;
  } catch (e) { handleError(e); }
}

export async function explainChallenge(payload: {
  fen: string; best_move_san: string; theme: string; pv_line: string[];
  correct: boolean; centipawn_loss: number; difficulty: string;
}): Promise<{ explanation: string }> {
  try {
    const res = await api.post<{ explanation: string }>("/challenge/explain", payload);
    return res.data;
  } catch (e) { handleError(e); }
}

export async function analyzeGame(pgn: string, depth = 14): Promise<GameAnalysisResponse> {
  try {
    const res = await api.post<ApiEnvelope<GameAnalysisResponse>>("/analyze-game", { pgn, depth }, { timeout: 600_000 });
    return unwrap(res.data);
  } catch (e) { handleError(e); }
}

export async function getHistory(): Promise<HistoryGame[]> {
  try {
    const res = await api.get<{ games: HistoryGame[] }>("/history");
    return res.data.games;
  } catch (e) { handleError(e); }
}

export async function saveGame(
  pgn: string, result: string, moves: MoveAnalysis[], summary: GameSummary,
): Promise<HistoryGame> {
  try {
    const res = await api.post<HistoryGame>("/history", { pgn, result, moves, summary });
    return res.data;
  } catch (e) { handleError(e); }
}
