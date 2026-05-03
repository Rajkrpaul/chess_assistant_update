import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { Chess } from "chess.js";
import type { MoveAnalysis, MoveClassification } from "../services/api";
import type { StockfishEvalResult } from "../services/stockfishService";

export type GameMode = "analysis" | "play";
export type PlayerColor = "white" | "black";

export interface MoveEvent {
  fen_before: string;
  fen_after: string;
  move_uci: string;
  move_san: string;
  ply: number;
  player: "human" | "ai";
  timestamp: number;
}

export interface LastClassification {
  classification: MoveClassification;
  centipawn_loss: number;
  insight: string;
  best_move_san: string;
  pv_line: string[];
  eval_before: number | null;
  eval_after: number | null;
}

export interface GameState {
  game: Chess;
  fen: string;
  mode: GameMode;
  playerColor: PlayerColor;
  plyCount: number;
  sanHistory: string[];

  evaluation: StockfishEvalResult | null;
  isEngineRunning: boolean;
  engineDepth: number;

  moveHistory: MoveAnalysis[];
  lastMoveEvent: MoveEvent | null;
  lastClassification: LastClassification | null;

  highlightSquares: Record<string, React.CSSProperties>;
  legalMoveSquares: Record<string, React.CSSProperties>;
  selectedSquare: string | null;
  isGameOver: boolean;
  gameResult: string;
  resignedResult: string | null;

  applyMove: (from: string, to: string, promotion?: string, player?: "human" | "ai") => boolean;
  setEvaluation: (result: StockfishEvalResult) => void;
  setMoveAnalysis: (analysis: MoveAnalysis) => void;
  setLastClassification: (c: LastClassification | null) => void;
  resetGame: () => void;
  loadFen: (fen: string) => void;
  setHighlightSquares: (squares: Record<string, React.CSSProperties>) => void;
  setLegalMoveSquares: (squares: Record<string, React.CSSProperties>) => void;
  setSelectedSquare: (sq: string | null) => void;
  setMode: (mode: GameMode) => void;
  setPlayerColor: (color: PlayerColor) => void;
  setEngineRunning: (running: boolean) => void;
  setResignedResult: (r: string | null) => void;
  setSanHistory: (h: string[]) => void;
}

const freshGame = () => new Chess();

export const useGameStore = create<GameState>()(
  subscribeWithSelector((set, get) => ({
    game: freshGame(),
    fen: new Chess().fen(),
    mode: "analysis",
    playerColor: "white",
    plyCount: 0,
    sanHistory: [],

    evaluation: null,
    isEngineRunning: false,
    engineDepth: 14,

    moveHistory: [],
    lastMoveEvent: null,
    lastClassification: null,

    highlightSquares: {},
    legalMoveSquares: {},
    selectedSquare: null,
    isGameOver: false,
    gameResult: "*",
    resignedResult: null,

    applyMove: (from, to, promotion = "q", player = "human") => {
      const state = get();
      const fenBefore = state.game.fen();
      const gameCopy = new Chess(fenBefore);
      try {
        const move = gameCopy.move({ from, to, promotion });
        if (!move) return false;
        const newSanHistory = [...state.sanHistory, move.san];
        const newPly = state.plyCount + 1;
        const event: MoveEvent = {
          fen_before: fenBefore,
          fen_after: gameCopy.fen(),
          move_uci: move.from + move.to + (move.promotion ?? ""),
          move_san: move.san,
          ply: newPly,
          player,
          timestamp: Date.now(),
        };
        set({
          game: gameCopy,
          fen: gameCopy.fen(),
          plyCount: newPly,
          sanHistory: newSanHistory,
          lastMoveEvent: event,
          lastClassification: null,
          highlightSquares: {},
          legalMoveSquares: {},
          selectedSquare: null,
          isGameOver: gameCopy.isGameOver(),
          gameResult: gameCopy.isGameOver()
            ? gameCopy.isCheckmate()
              ? gameCopy.turn() === "w" ? "0-1" : "1-0"
              : "1/2-1/2"
            : "*",
        });
        return true;
      } catch {
        return false;
      }
    },

    setEvaluation: (result) => set({ evaluation: result, isEngineRunning: false }),
    setMoveAnalysis: (analysis) =>
      set((s) => {
        const filtered = s.moveHistory.filter((m) => m.ply !== analysis.ply);
        return { moveHistory: [...filtered, analysis].sort((a, b) => a.ply - b.ply) };
      }),
    setLastClassification: (c) => set({ lastClassification: c }),
    setHighlightSquares: (squares) => set({ highlightSquares: squares }),
    setLegalMoveSquares: (squares) => set({ legalMoveSquares: squares }),
    setSelectedSquare: (sq) => set({ selectedSquare: sq }),
    setMode: (mode) => set({ mode }),
    setPlayerColor: (color) => set({ playerColor: color }),
    setEngineRunning: (running) => set({ isEngineRunning: running }),
    setResignedResult: (r) =>
      set({ resignedResult: r, isGameOver: r !== null, gameResult: r ?? "*" }),
    setSanHistory: (h) => set({ sanHistory: h }),

    resetGame: () => {
      const g = freshGame();
      set({
        game: g,
        fen: g.fen(),
        plyCount: 0,
        sanHistory: [],
        evaluation: null,
        moveHistory: [],
        lastMoveEvent: null,
        lastClassification: null,
        highlightSquares: {},
        legalMoveSquares: {},
        selectedSquare: null,
        isGameOver: false,
        gameResult: "*",
        resignedResult: null,
      });
    },

    loadFen: (fen) => {
      try {
        const g = new Chess(fen);
        set({
          game: g,
          fen: g.fen(),
          plyCount: 0,
          sanHistory: [],
          evaluation: null,
          moveHistory: [],
          lastMoveEvent: null,
          lastClassification: null,
          highlightSquares: {},
          legalMoveSquares: {},
          selectedSquare: null,
          isGameOver: g.isGameOver(),
          gameResult: "*",
          resignedResult: null,
        });
      } catch {
        console.warn("Invalid FEN");
      }
    },
  }))
);
