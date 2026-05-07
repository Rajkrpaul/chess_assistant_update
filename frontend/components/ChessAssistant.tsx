import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useRouter } from "next/router";

import MoveOverlay from "./MoveOverlay";
import MoveList from "./MoveList";
import PostGameReport from "./PostGameReport";
import HistoryPanel from "./HistoryPanel";
import SettingsPanel from "./SettingsPanel";
import SavedPositionsPanel from "./SavedPositionsPanel";
import MoveInsightPopup from "./MoveInsightPopup";
import CoachPanel from "./coach/CoachPanel";
import { EngineLineCard } from "./board/EngineLineCard";
import { EvalBarPanel } from "./board/EvalBarPanel";
import { MoveClassificationToast } from "./board/MoveClassificationToast";
import { SavePositionModal } from "./shared/SavePositionModal";
import { ErrorBoundary } from "./shared/ErrorBoundary";

import { useTheme, THEMES, Theme } from "../context/ThemeContext";
import { useSettings } from "../context/SettingsContext";
import { useGameStore } from "../store/gameStore";
import { useCoachStore } from "../store/coachStore";
import { useCoachReactor } from "../hooks/useCoachReactor";
import { useBoardHighlights } from "../hooks/useBoardHighlights";
import { useEngineSubscription } from "../hooks/useEngineSubscription";
import { analyzeAndDispatch } from "../services/moveAnalysisService";
import { engineOrchestrator } from "../services/engineOrchestrator";
import {
  getEvaluation, cancelEvaluation, pickMoveForDifficulty,
  clearEvalCache, Difficulty,
} from "../services/stockfishService";
import { MoveAnalysis } from "../services/api";

const BOARD_WIDTH = 480;
const HINT_IDLE_MS = 12_000;

type PlayerColor = "white" | "black";

function uciToSquares(uci: string): { from: string; to: string } | null {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

const PIECE_KEYS = ["wP","wN","wB","wR","wQ","wK","bP","bN","bB","bR","bQ","bK"] as const;
const WIKIMEDIA = "https://upload.wikimedia.org/wikipedia/commons";
const CLASSIC_PIECES: Record<string, string> = {
  wK:`${WIKIMEDIA}/4/42/Chess_klt45.svg`,wQ:`${WIKIMEDIA}/1/15/Chess_qlt45.svg`,
  wR:`${WIKIMEDIA}/7/72/Chess_rlt45.svg`,wB:`${WIKIMEDIA}/b/b1/Chess_blt45.svg`,
  wN:`${WIKIMEDIA}/7/70/Chess_nlt45.svg`,wP:`${WIKIMEDIA}/4/45/Chess_plt45.svg`,
  bK:`${WIKIMEDIA}/f/f0/Chess_kdt45.svg`,bQ:`${WIKIMEDIA}/4/47/Chess_qdt45.svg`,
  bR:`${WIKIMEDIA}/f/ff/Chess_rdt45.svg`,bB:`${WIKIMEDIA}/9/98/Chess_bdt45.svg`,
  bN:`${WIKIMEDIA}/e/ef/Chess_ndt45.svg`,bP:`${WIKIMEDIA}/c/c7/Chess_pdt45.svg`,
};
const ANCIENT_FILTER = "sepia(0.8) saturate(1.4) hue-rotate(10deg) contrast(1.1)";

function buildCustomPieces(theme: Theme): Record<string, (p:{squareWidth:number})=>JSX.Element>|undefined {
  if (theme === "modern") return undefined;
  const imgFilter = theme === "ancient" ? ANCIENT_FILTER : undefined;
  const pieces: Record<string, (p:{squareWidth:number})=>JSX.Element> = {};
  for (const key of PIECE_KEYS) {
    const url = CLASSIC_PIECES[key];
    /* eslint-disable @next/next/no-img-element */
    pieces[key] = ({ squareWidth }) => (
      <img src={url} alt={key} width={squareWidth} height={squareWidth}
        style={{ userSelect:"none", pointerEvents:"none", filter: imgFilter }} />
    );
  }
  return pieces;
}

export default function ChessAssistant() {
  const router = useRouter();
  const { theme, config, setTheme, isLightMode, toggleLightMode } = useTheme();
  const { settings } = useSettings();

  // Store
  const game = useGameStore(s => s.game);
  const fen = useGameStore(s => s.fen);
  const mode = useGameStore(s => s.mode);
  const playerColor = useGameStore(s => s.playerColor);
  const moveHistory = useGameStore(s => s.moveHistory);
  const evaluation = useGameStore(s => s.evaluation);
  const isGameOver = useGameStore(s => s.isGameOver);
  const gameResult = useGameStore(s => s.gameResult);
  const resignedResult = useGameStore(s => s.resignedResult);
  const highlightSquares = useGameStore(s => s.highlightSquares);
  const legalMoveSquares = useGameStore(s => s.legalMoveSquares);
  const selectedSquare = useGameStore(s => s.selectedSquare);
  const sanHistory = useGameStore(s => s.sanHistory);

  const applyMove = useGameStore(s => s.applyMove);
  const setHighlightSquares = useGameStore(s => s.setHighlightSquares);
  const setLegalMoveSquares = useGameStore(s => s.setLegalMoveSquares);
  const setSelectedSquare = useGameStore(s => s.setSelectedSquare);
  const setMode = useGameStore(s => s.setMode);
  const setPlayerColor = useGameStore(s => s.setPlayerColor);
  const resetGame = useGameStore(s => s.resetGame);
  const loadFen = useGameStore(s => s.loadFen);
  const setResignedResult = useGameStore(s => s.setResignedResult);

  const unreadCount = useCoachStore(s => s.unreadCount);

  // Mount global hooks
  useCoachReactor();
  useBoardHighlights();
  useEngineSubscription();

  const [activeTab, setActiveTab] = useState<string>("Coach");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [showReport, setShowReport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [replayPly, setReplayPly] = useState<number|null>(null);
  const [insightMove, setInsightMove] = useState<MoveAnalysis|null>(null);
  const [insightRect, setInsightRect] = useState<DOMRect|null>(null);
  const [arrowKey, setArrowKey] = useState(0);
  const [hintActive, setHintActive] = useState(false);
  const [hintPrompt, setHintPrompt] = useState(false);
  const [stockfishAssist, setStockfishAssist] = useState(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const lastEvalRef = useRef(evaluation);
  const isAiThinkingRef = useRef(false);

  useEffect(() => { lastEvalRef.current = evaluation; }, [evaluation]);

  const customPieces = useMemo(() => buildCustomPieces(theme), [theme]);

  // Game over → show report
  useEffect(() => {
    if (isGameOver && sanHistory.length > 0) {
      const t = setTimeout(() => setShowReport(true), 800);
      return () => clearTimeout(t);
    }
  }, [isGameOver, sanHistory.length]);

  // Idle hint timer
  const scheduleHint = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (mode === "play" && stockfishAssist && settings.showHints) {
      idleTimerRef.current = setTimeout(() => setHintPrompt(true), HINT_IDLE_MS);
    }
  }, [mode, stockfishAssist, settings.showHints]);

  useEffect(() => {
    if (!settings.showHints) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      setHintPrompt(false); setHintActive(false);
    }
  }, [settings.showHints]);

  useEffect(() => {
    setHintPrompt(false); setHintActive(false);
    scheduleHint();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [fen, mode, scheduleHint]);

  // AI move logic
  const makeAiMove = useCallback(async (currentFen: string) => {
    if (isAiThinkingRef.current) return;
    if (new Chess(currentFen).isGameOver()) return;
    isAiThinkingRef.current = true;
    try {
      const evalResult = await getEvaluation(currentFen, settings.depth, settings.skillLevel);
      const chosenMove = pickMoveForDifficulty(evalResult, difficulty);
      if (!chosenMove) return;
      const fenBefore = currentFen;
      const ok = applyMove(chosenMove.slice(0,2), chosenMove.slice(2,4), chosenMove[4] ?? "q", "ai");
      if (!ok) return;
      const newState = useGameStore.getState();
      analyzeAndDispatch(fenBefore, chosenMove, newState.plyCount, settings.depth, settings.skillLevel);
      setArrowKey(k => k + 1);
    } catch (e) {
      console.warn("[makeAiMove]", e);
    } finally {
      isAiThinkingRef.current = false;
    }
  }, [difficulty, settings.depth, settings.skillLevel, applyMove]);

  const afterPlayerMove = useCallback((fenBefore: string, uci: string, newFen: string) => {
    const ply = useGameStore.getState().plyCount;
    analyzeAndDispatch(fenBefore, uci, ply, settings.depth, settings.skillLevel);
    setArrowKey(k => k + 1);
    if (mode === "play") {
      setTimeout(() => makeAiMove(newFen), 400);
    }
  }, [mode, settings.depth, settings.skillLevel, makeAiMove]);

  const onPieceDrop = useCallback((sourceSquare: string, targetSquare: string): boolean => {
    if (mode === "play" && ((playerColor === "white" && game.turn() !== "w") || (playerColor === "black" && game.turn() !== "b"))) return false;
    const fenBefore = game.fen();
    const ok = applyMove(sourceSquare, targetSquare, "q", "human");
    if (!ok) return false;
    const newState = useGameStore.getState();
    afterPlayerMove(fenBefore, sourceSquare + targetSquare, newState.fen);
    return true;
  }, [game, mode, playerColor, applyMove, afterPlayerMove]);

  const onSquareClick = useCallback((square: string) => {
    const piece = game.get(square as any);
    const isPlayerTurn = mode !== "play" || (playerColor === "white" && game.turn() === "w") || (playerColor === "black" && game.turn() === "b");

    if (piece && piece.color === game.turn() && isPlayerTurn) {
      setSelectedSquare(square);
      const moves = game.moves({ square: square as any, verbose: true });
      const newHighlights: Record<string, React.CSSProperties> = {
        [square]: { background: `${config.accentPrimary}55`, borderRadius: "4px", boxShadow: `inset 0 0 0 3px ${config.accentPrimary}` },
      };
      moves.forEach((m: any) => {
        const isCapture = m.flags.includes("c") || m.flags.includes("e");
        newHighlights[m.to] = isCapture
          ? { background: "rgba(239,68,68,0.35)", borderRadius: "50%" }
          : { background: "rgba(100,200,240,0.3)", borderRadius: "50%" };
      });
      setLegalMoveSquares(newHighlights);
      return;
    }
    if (selectedSquare && legalMoveSquares[square] && isPlayerTurn) {
      const fenBefore = game.fen();
      const ok = applyMove(selectedSquare, square, "q", "human");
      if (ok) {
        const newState = useGameStore.getState();
        afterPlayerMove(fenBefore, selectedSquare + square, newState.fen);
      }
    }
    setSelectedSquare(null);
    setLegalMoveSquares({});
  }, [game, selectedSquare, legalMoveSquares, mode, playerColor, config, applyMove, afterPlayerMove, setSelectedSquare, setLegalMoveSquares]);

  const handleReset = useCallback(() => {
    cancelEvaluation();
    clearEvalCache();
    engineOrchestrator.cancel();
    isAiThinkingRef.current = false;
    resetGame();
    setShowReport(false);
    setInsightMove(null);
    setInsightRect(null);
    setReplayPly(null);
    setHintActive(false);
    setHintPrompt(false);
    setArrowKey(k => k + 1);
  }, [resetGame]);

  const handleFenLoad = useCallback((f: string) => {
    loadFen(f);
    setHintActive(false);
    setHintPrompt(false);
  }, [loadFen]);

  const handleResign = useCallback(() => {
    if (game.history().length === 0) return;
    const r = playerColor === "white" ? "0-1" : "1-0";
    setResignedResult(r);
    setShowReport(true);
  }, [game, playerColor, setResignedResult]);

  const showHint = useCallback(async () => {
    if (!stockfishAssist || !settings.showHints) return;
    setHintPrompt(false); setHintActive(true);
    const best = lastEvalRef.current?.bestMove ?? evaluation?.bestMove;
    if (best) {
      const sq = uciToSquares(best);
      if (sq) {
        setHighlightSquares({
          [sq.from]: { background: "rgba(34,197,94,0.5)", borderRadius: "4px" },
          [sq.to]: { background: "rgba(34,197,94,0.6)", borderRadius: "4px" },
        });
      }
    }
  }, [evaluation, stockfishAssist, settings.showHints, setHighlightSquares]);

  const startPlayMode = useCallback((overrideColor?: PlayerColor) => {
    const activeColor = overrideColor ?? playerColor;
    setMode("play");
    resetGame();
    setPlayerColor(activeColor);
    setShowReport(false);
    setInsightMove(null);
    setReplayPly(null);
    setArrowKey(k => k + 1);
    if (activeColor === "black") {
      const startFen = new Chess().fen();
      setTimeout(() => makeAiMove(startFen), 500);
    }
  }, [playerColor, setMode, resetGame, setPlayerColor, makeAiMove]);

  const currentPgn = useMemo(() => {
    if (sanHistory.length === 0) return "";
    try {
      const tmp = new Chess();
      for (const san of sanHistory) tmp.move(san);
      return tmp.pgn();
    } catch { return ""; }
  }, [sanHistory]);

  const mergedSquareStyles = useMemo(
    () => Object.keys(legalMoveSquares).length > 0 ? legalMoveSquares : highlightSquares,
    [legalMoveSquares, highlightSquares]
  );

  const sortedMoveHistory = useMemo(() => [...moveHistory].sort((a,b) => a.ply - b.ply), [moveHistory]);

  // Build a "live" move list that shows moves immediately (from sanHistory)
  // and gets upgraded with classification data as backend analysis completes.
  const liveMoveList = useMemo(() => {
    const analyzed = new Map(sortedMoveHistory.map(m => [m.ply, m]));
    return sanHistory.map((san, idx) => {
      const ply = idx + 1;
      if (analyzed.has(ply)) return analyzed.get(ply)!;
      // Pending move: shown immediately, no classification yet
      return {
        move_uci: san,
        move_san: san,
        ply,
        classification: "Good" as const,
        eval_before: null,
        eval_after: null,
        centipawn_loss: 0,
        best_move_uci: "",
        best_move_san: "",
        pv_line: [] as string[],
        insight: "Analysis in progress…",
        is_book: false,
        is_brilliant: false,
      };
    });
  }, [sanHistory, sortedMoveHistory]);

  const isLoading = useGameStore(s => s.isEngineRunning);
  const showArrows = settings.showBestMoveArrows && ((mode === "play" && stockfishAssist) || mode === "analysis");

  const insights = useMemo(() => {
    const counts = { Best:0, Excellent:0, Good:0, Inaccuracy:0, Mistake:0, Blunder:0 };
    // Only count fully-analyzed moves for accurate classification stats
    sortedMoveHistory.forEach(m => {
      if (["Brilliant","Great","Book"].includes(m.classification)) counts.Best++;
      else if (m.classification in counts) (counts as any)[m.classification]++;
    });
    return counts;
  }, [sortedMoveHistory]);

  return (
    <div style={{ height:"100vh", overflow:"hidden", display:"flex", background:config.background, transition:"background 0.4s", color:config.textPrimary, fontFamily:"'DM Sans', sans-serif", position:"relative" }}>
      {/* BG image */}
      <div style={{ position:"absolute", inset:0, backgroundImage:"url(/global-bg.png)", backgroundSize:"cover", backgroundPosition:"center", opacity:0.4, filter:isLightMode?"invert(1) grayscale(100%) contrast(1.2)":"none", mixBlendMode:isLightMode?"multiply":"screen", pointerEvents:"none", zIndex:0 }} />

      {/* Nav Bar */}
      <div style={{ width:"80px", borderRight:`1px solid ${config.glassBorder}`, display:"flex", flexDirection:"column", alignItems:"center", padding:"16px 0", background:config.glassBg, backdropFilter:"blur(12px)", zIndex:11 }}>
        <div style={{ fontSize:"1.8rem", filter:"drop-shadow(0 0 8px rgba(212,175,55,0.4))", marginBottom:"20px" }}>♔</div>
        <nav style={{ display:"flex", flexDirection:"column", gap:"12px", width:"100%", padding:"0 8px" }}>
          {[
            { id:"Coach", icon:"♚", label:"Coach" },
            { id:"Analysis", icon:"📊", label:"Analysis" },
            { id:"Play vs Computer", icon:"🎮", label:"Play vs AI" },
            { id:"History", icon:"🕐", label:"History" },
            { id:"Saved Positions", icon:"🔖", label:"Saved" },
            { id:"Challenges", icon:"⚔️", label:"Challenges" },
            { id:"Settings", icon:"⚙️", label:"Settings" },
          ].map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button key={item.id} onClick={() => {
                if (item.id === "Challenges") { router.push("/challenges"); return; }
                setActiveTab(item.id);
                if (item.id === "Analysis") setMode("analysis");
                else if (item.id === "Play vs Computer") startPlayMode();
                else if (item.id === "History") setShowHistory(true);
              }}
                style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"4px", padding:"8px 4px", borderRadius:"8px", background:isActive?`${config.accentPrimary}22`:"transparent", border:`1px solid ${isActive?`${config.accentPrimary}44`:"transparent"}`, color:isActive?config.accentPrimary:config.textSecondary, fontSize:"0.65rem", fontWeight:isActive?600:400, cursor:"pointer", transition:"all 0.2s", position:"relative" }}
              >
                <span style={{ fontSize:"1.2rem", opacity:isActive?1:0.7 }}>{item.icon}</span>
                {item.label}
                {item.id === "Coach" && unreadCount > 0 && (
                  <span style={{ position:"absolute", top:"4px", right:"4px", background:"#EF4444", color:"#fff", borderRadius:"50%", width:"14px", height:"14px", fontSize:"0.55rem", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 }}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div style={{ flex:1 }} />
        <button onClick={toggleLightMode} style={{ width:"100%", padding:"8px 0", borderRadius:"8px", border:"none", background:`${config.textSecondary}15`, color:config.textSecondary, fontSize:"1rem", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
          {isLightMode?"☀️":"🌙"}
        </button>
      </div>

      {/* Left Sidebar */}
      {activeTab === "Coach" && (
        <div style={{ width:"300px", borderRight:`1px solid ${config.glassBorder}`, display:"flex", flexDirection:"column", background:config.glassBg, backdropFilter:"blur(12px)", zIndex:10 }}>
          <ErrorBoundary label="Coach Panel">
            <CoachPanel />
          </ErrorBoundary>
        </div>
      )}

      {/* Main area */}
      {activeTab === "Settings" ? (
        <div style={{ flex:1, overflowY:"auto", padding:"16px 32px", position:"relative", zIndex:1 }}>
          <SettingsPanel />
        </div>
      ) : activeTab === "Saved Positions" ? (
        <div style={{ flex:1, overflowY:"auto", padding:"16px 32px", position:"relative", zIndex:1 }}>
          <SavedPositionsPanel onLoad={(f) => { handleFenLoad(f); setActiveTab("Analysis"); setMode("analysis"); }} />
        </div>
      ) : (
        <>
          <div style={{ flex:1, display:"flex", flexDirection:"column", padding:"16px 32px", overflowY:"auto", position:"relative", zIndex:1 }}>
            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                <span style={{ fontSize:"1.1rem", color:config.accentPrimary }}>{mode==="analysis"?"📊":"🎮"}</span>
                <h2 style={{ margin:0, fontSize:"1.1rem", fontWeight:600 }}>{mode==="analysis"?"Analysis Mode":"Play vs Computer"}</h2>
              </div>
              <div style={{ display:"flex", gap:"8px" }}>
                {(Object.keys(THEMES) as Theme[]).map(t => (
                  <button key={t} onClick={() => setTheme(t)}
                    style={{ padding:"4px 12px", borderRadius:"8px", border:`1px solid ${t===theme?config.accentPrimary:config.glassBorder}`, background:t===theme?`${config.accentPrimary}22`:"transparent", color:t===theme?config.accentPrimary:config.textSecondary, fontSize:"0.75rem", cursor:"pointer" }}>
                    {t==="modern"?"🔳":t==="classic"?"🪵":"🏛"} {THEMES[t].name}
                  </button>
                ))}
              </div>
            </div>

            {/* Play options */}
            {mode === "play" && (
              <div style={{ display:"flex", gap:"12px", justifyContent:"center", marginBottom:"16px", flexWrap:"wrap", alignItems:"center" }}>
                <div style={{ display:"flex", gap:"6px" }}>
                  {(["white","black"] as PlayerColor[]).map(c => (
                    <button key={c} onClick={() => { setPlayerColor(c); startPlayMode(c); }}
                      style={{ padding:"4px 12px", borderRadius:"12px", border:`1px solid ${playerColor===c?config.accentPrimary:config.glassBorder}`, background:playerColor===c?`${config.accentPrimary}22`:"transparent", color:playerColor===c?config.accentPrimary:config.textSecondary, fontSize:"0.75rem", cursor:"pointer" }}>
                      {c==="white"?"♙ White":"♟ Black"}
                    </button>
                  ))}
                </div>
                <div style={{ display:"flex", gap:"6px" }}>
                  {(["easy","medium","hard","extreme"] as Difficulty[]).map(d => (
                    <button key={d} onClick={() => setDifficulty(d)}
                      style={{ padding:"4px 12px", borderRadius:"12px", border:`1px solid ${config.accentSecondary}`, background:difficulty===d?`${config.accentSecondary}22`:"transparent", color:difficulty===d?config.accentSecondary:config.textSecondary, fontSize:"0.75rem", cursor:"pointer", textTransform:"capitalize" }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Board */}
            <div style={{ display:"flex", justifyContent:"center" }}>
              <div style={{ display:"flex", flexDirection:"column", gap:"16px", maxWidth:BOARD_WIDTH }}>
                <div style={{ position:"relative", filter:`drop-shadow(0 0 32px ${config.accentSecondary}22)` }}>
                  <ErrorBoundary label="Board">
                    <Chessboard
                      position={fen}
                      onPieceDrop={onPieceDrop}
                      onSquareClick={onSquareClick}
                      customSquareStyles={mergedSquareStyles}
                      boardWidth={BOARD_WIDTH}
                      customBoardStyle={{ borderRadius:"8px", overflow:"hidden", boxShadow:"0 8px 48px rgba(0,0,0,0.4)", position:"relative" }}
                      customDarkSquareStyle={{ backgroundColor:config.boardDark }}
                      customLightSquareStyle={{ backgroundColor:config.boardLight }}
                      customPieces={customPieces}
                      areArrowsAllowed
                      boardOrientation={mode==="play"?playerColor:"white"}
                    />
                  </ErrorBoundary>
                  {showArrows && (
                    <MoveOverlay key={arrowKey} bestMove={evaluation?.bestMove??null} secondBestMove={evaluation?.secondBestMove??null} boardWidth={BOARD_WIDTH} flipped={mode==="play"&&playerColor==="black"} />
                  )}
                  <MoveClassificationToast />
                </div>

                {/* Controls */}
                <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
                  {mode === "analysis" && (
                    <>
                      <button onClick={() => engineOrchestrator.evaluate(fen, settings.depth, settings.skillLevel)} disabled={isLoading||isGameOver}
                        style={{ flex:2, padding:"10px", borderRadius:"8px", border:"none", background:isLoading||isGameOver?`${config.accentSecondary}22`:config.accentPrimary, color:isLoading||isGameOver?config.textSecondary:"#000", fontWeight:600, fontSize:"0.85rem", cursor:isLoading||isGameOver?"not-allowed":"pointer" }}>
                        ✦ Analyze Position
                      </button>
                      <button onClick={() => setShowSaveModal(true)}
                        style={{ flex:1, padding:"10px", borderRadius:"8px", border:`1px solid ${config.glassBorder}`, background:config.glassBg, color:config.textSecondary, fontSize:"0.85rem", cursor:"pointer" }}>
                        🔖 Save Pos
                      </button>
                    </>
                  )}
                  {mode === "play" && stockfishAssist && settings.showHints && (
                    <button onClick={showHint} disabled={isLoading||isGameOver}
                      style={{ flex:2, padding:"10px", borderRadius:"8px", border:`1px solid ${config.accentPrimary}55`, background:`${config.accentPrimary}15`, color:config.accentPrimary, fontWeight:600, fontSize:"0.85rem", cursor:isLoading||isGameOver?"not-allowed":"pointer" }}>
                      💡 Show Hint
                    </button>
                  )}
                  <button onClick={handleReset}
                    style={{ flex:1, padding:"10px", borderRadius:"8px", border:`1px solid ${config.glassBorder}`, background:"transparent", color:config.textSecondary, fontSize:"0.85rem", cursor:"pointer" }}>
                    ↺ Reset
                  </button>
                  <button onClick={() => setPlayerColor(playerColor==="white"?"black":"white")}
                    style={{ flex:1, padding:"10px", borderRadius:"8px", border:`1px solid ${config.glassBorder}`, background:"transparent", color:config.textSecondary, fontSize:"0.85rem", cursor:"pointer" }}>
                    ⇅ Flip
                  </button>
                  {mode === "play" && !isGameOver && !resignedResult && game.history().length > 0 && (
                    <button onClick={handleResign}
                      style={{ flex:1, padding:"10px", borderRadius:"8px", border:"1px solid rgba(239,68,68,0.4)", background:"rgba(239,68,68,0.15)", color:"#EF4444", fontWeight:600, fontSize:"0.85rem", cursor:"pointer" }}>
                      🏳 Resign
                    </button>
                  )}
                </div>

                <ErrorBoundary label="Engine Line">
                  <EngineLineCard />
                </ErrorBoundary>
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div style={{ width:"340px", padding:"16px", display:"flex", flexDirection:"column", gap:"12px", overflowY:"auto", borderLeft:`1px solid ${config.glassBorder}`, position:"relative", zIndex:1 }}>
            {/* FEN */}
            <div style={{ background:config.glassBg, border:`1px solid ${config.glassBorder}`, borderRadius:"10px", padding:"12px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"8px" }}>
                <span style={{ fontSize:"0.8rem", fontWeight:600 }}>♙ Position (FEN)</span>
              </div>
              <div style={{ background:`${config.textSecondary}15`, padding:"8px", borderRadius:"6px", fontFamily:"'JetBrains Mono',monospace", fontSize:"0.65rem", color:config.textSecondary, wordBreak:"break-all", marginBottom:"8px" }}>
                {fen}
              </div>
              <div style={{ display:"flex", gap:"6px" }}>
                <button onClick={() => handleFenLoad(fen)} style={{ flex:1, padding:"6px", borderRadius:"6px", border:`1px solid ${config.accentPrimary}55`, background:"transparent", color:config.accentPrimary, fontSize:"0.7rem", cursor:"pointer" }}>Load</button>
                <button onClick={() => navigator.clipboard.writeText(fen)} style={{ flex:1, padding:"6px", borderRadius:"6px", border:`1px solid ${config.glassBorder}`, background:"transparent", color:config.textSecondary, fontSize:"0.7rem", cursor:"pointer" }}>Copy</button>
              </div>
            </div>

            {/* Eval Bar */}
            <ErrorBoundary label="Eval Bar">
              <EvalBarPanel />
            </ErrorBoundary>

            {/* Move Insights */}
            <div style={{ background:config.glassBg, border:`1px solid ${config.glassBorder}`, borderRadius:"10px", padding:"16px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
                <span style={{ fontSize:"0.8rem", fontWeight:600 }}>♞ Move Insights ({liveMoveList.length})</span>
                <button onClick={() => setShowReport(true)} style={{ fontSize:"0.65rem", color:config.accentPrimary, background:"transparent", border:"none", cursor:"pointer" }}>View Analysis →</button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                {[
                  { label:"Best Moves", color:"#22C55E", icon:"★", count:insights.Best },
                  { label:"Excellent", color:"#3B82F6", icon:"★", count:insights.Excellent },
                  { label:"Good Moves", color:"#10B981", icon:"✓", count:insights.Good },
                  { label:"Inaccuracies", color:"#F59E0B", icon:"?!", count:insights.Inaccuracy },
                  { label:"Mistakes", color:"#F97316", icon:"?", count:insights.Mistake },
                  { label:"Blunders", color:"#EF4444", icon:"??", count:insights.Blunder },
                ].map(row => (
                  <div key={row.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"6px", fontSize:"0.75rem", color:config.textSecondary }}>
                      <span style={{ color:row.color }}>{row.icon}</span>{row.label}
                    </div>
                    <span style={{ fontWeight:600, fontSize:"0.8rem" }}>{row.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Move List */}
            <div style={{ background:config.glassBg, border:`1px solid ${config.glassBorder}`, borderRadius:"10px", padding:"12px", maxHeight:"220px", overflowY:"auto" }}>
              <div style={{ fontSize:"0.8rem", fontWeight:600, marginBottom:"8px" }}>📋 Move History ({liveMoveList.length})</div>
              <MoveList
                moves={liveMoveList}
                selectedPly={replayPly}
                onMoveClick={(move, rect) => { setInsightMove(move); setInsightRect(rect); setReplayPly(move.ply); }}
              />
            </div>

            {/* Context tip card */}
            <div style={{ background:`${config.accentPrimary}12`, border:`1px solid ${config.accentPrimary}33`, borderRadius:"10px", padding:"12px", position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", right:"-5px", bottom:"-15px", fontSize:"5rem", opacity:0.05 }}>♞</div>
              <div style={{ fontSize:"0.78rem", fontWeight:600, color:config.accentPrimary, marginBottom:"6px" }}>💡 Quick Tip</div>
              <div style={{ fontSize:"0.7rem", color:config.textSecondary, lineHeight:1.4 }}>
                {mode === "play"
                  ? "Click a piece to see legal moves. The coach reacts automatically to your moves."
                  : "Use Analyze Position to get engine evaluation. Ask the coach for deeper insights."}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      <MoveInsightPopup move={insightMove} anchorRect={insightRect} onClose={() => { setInsightMove(null); setInsightRect(null); }} />
      {showSaveModal && <SavePositionModal fen={fen} onClose={() => setShowSaveModal(false)} />}
      {showReport && (
        <ErrorBoundary label="Post Game Report">
          <PostGameReport pgn={currentPgn} result={gameResult} onClose={() => setShowReport(false)}
            onAnalysisComplete={(moves) => useGameStore.setState({ moveHistory: moves })} />
        </ErrorBoundary>
      )}
      {showHistory && (
        <HistoryPanel onClose={() => setShowHistory(false)}
          onLoadPosition={(f, ply, moves) => { useGameStore.setState({ moveHistory: moves }); setReplayPly(ply); setShowHistory(false); }} />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
