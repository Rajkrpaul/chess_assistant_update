import React, { useState, useEffect, useCallback, useRef } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useTheme } from "../context/ThemeContext";
import { useRouter } from "next/router";
import {
  getChallenge, validateChallenge, getChallengeHint, explainChallenge,
  Challenge, ChallengeValidation,
} from "../services/api";

type Difficulty = "easy" | "medium" | "hard";
type PageStatus = "loading" | "playing" | "validating" | "success" | "failed";

const DIFF_META = {
  easy:   { color: "#22C55E", label: "Easy",   icon: "🟢", desc: "One-move tactics" },
  medium: { color: "#F59E0B", label: "Medium", icon: "🟡", desc: "Two-move combinations" },
  hard:   { color: "#EF4444", label: "Hard",   icon: "🔴", desc: "Deep calculation" },
};

// ── Streak storage ────────────────────────────────────────────────────────────
function getStreaks(): { current: number; best: number; total: number } {
  try {
    return JSON.parse(localStorage.getItem("chess_challenge_streaks") || '{"current":0,"best":0,"total":0}');
  } catch { return { current: 0, best: 0, total: 0 }; }
}
function saveStreaks(s: { current: number; best: number; total: number }) {
  try { localStorage.setItem("chess_challenge_streaks", JSON.stringify(s)); } catch {}
}

export default function ChallengesPage() {
  const { config } = useTheme();
  const router = useRouter();

  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [game, setGame] = useState(() => new Chess());
  const [status, setStatus] = useState<PageStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ChallengeValidation | null>(null);
  const [explanation, setExplanation] = useState<string>("");
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [hints, setHints] = useState<string[]>([]);
  const [loadingHint, setLoadingHint] = useState(false);
  const [streaks, setStreaks] = useState(getStreaks());
  const [highlightSquares, setHighlightSquares] = useState<Record<string, React.CSSProperties>>({});
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalSquares, setLegalSquares] = useState<Record<string, React.CSSProperties>>({});
  const [showPv, setShowPv] = useState(false);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load challenge ──────────────────────────────────────────────────────────
  const loadChallenge = useCallback(async (diff: Difficulty) => {
    setStatus("loading");
    setError(null);
    setValidation(null);
    setExplanation("");
    setAttempts(0);
    setHints([]);
    setHighlightSquares({});
    setSelectedSquare(null);
    setLegalSquares({});
    setShowPv(false);
    try {
      const c = await getChallenge(diff);
      setChallenge(c);
      setGame(new Chess(c.fen));
      setStatus("playing");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load challenge");
      setStatus("failed");
    }
  }, []);

  useEffect(() => { loadChallenge(difficulty); }, [difficulty, loadChallenge]);

  // ── Fetch explanation ───────────────────────────────────────────────────────
  const fetchExplanation = useCallback(async (c: Challenge, v: ChallengeValidation) => {
    setLoadingExplanation(true);
    try {
      const res = await explainChallenge({
        fen: c.fen,
        best_move_san: v.best_move_san || c.best_move_san || c.best_move,
        theme: c.theme,
        pv_line: v.line || c.pv_line || [],
        correct: v.correct,
        centipawn_loss: v.centipawn_loss || 0,
        difficulty,
      });
      setExplanation(res.explanation);
    } catch {
      setExplanation("");
    } finally {
      setLoadingExplanation(false);
    }
  }, [difficulty]);

  // ── Highlight squares briefly ───────────────────────────────────────────────
  const flashSquares = useCallback((styles: Record<string, React.CSSProperties>, ms = 2000) => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightSquares(styles);
    highlightTimer.current = setTimeout(() => setHighlightSquares({}), ms);
  }, []);

  // ── Move validation ─────────────────────────────────────────────────────────
  const handleMove = useCallback(async (from: string, to: string, promotion = "q") => {
    if (!challenge || status !== "playing") return false;
    const gameCopy = new Chess(game.fen());
    const move = gameCopy.move({ from, to, promotion });
    if (!move) return false;

    setGame(gameCopy);
    setSelectedSquare(null);
    setLegalSquares({});
    setStatus("validating");

    const currentAttempts = attempts + 1;
    setAttempts(currentAttempts);

    try {
      const res = await validateChallenge(
        challenge.fen,
        from + to + (move.promotion || ""),
        difficulty,
        currentAttempts,
        challenge.best_move_san || "",
        challenge.theme,
      );
      setValidation(res);

      if (res.correct) {
        // Flash green
        flashSquares({
          [from]: { background: "rgba(34,197,94,0.5)", borderRadius: "4px" },
          [to]: { background: "rgba(34,197,94,0.6)", borderRadius: "4px", boxShadow: "inset 0 0 12px rgba(34,197,94,0.8)" },
        }, 2500);
        setStatus("success");
        const newStreaks = { current: streaks.current + 1, best: Math.max(streaks.best, streaks.current + 1), total: streaks.total + 1 };
        setStreaks(newStreaks);
        saveStreaks(newStreaks);
      } else {
        // Flash red, reset board
        flashSquares({
          [from]: { background: "rgba(239,68,68,0.4)", borderRadius: "4px" },
          [to]: { background: "rgba(239,68,68,0.5)", borderRadius: "4px" },
        }, 1200);
        setStatus("failed");
        const newStreaks = { ...streaks, current: 0 };
        setStreaks(newStreaks);
        saveStreaks(newStreaks);
        // Reset board after flash
        setTimeout(() => setGame(new Chess(challenge.fen)), 1200);
      }

      // Fetch AI explanation
      fetchExplanation(challenge, res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Validation error");
      setStatus("playing");
      setGame(new Chess(challenge.fen));
    }
  }, [challenge, game, status, attempts, difficulty, streaks, flashSquares, fetchExplanation]);

  const onPieceDrop = useCallback((src: string, tgt: string, piece: string): boolean => {
    handleMove(src, tgt, piece[1]?.toLowerCase() ?? "q");
    return true;
  }, [handleMove]);

  const onSquareClick = useCallback((square: string) => {
    if (status !== "playing" || !challenge) return;
    const piece = game.get(square as any);
    const isPlayerTurn = (new Chess(challenge.fen).turn() === "w") ? game.turn() === "w" : game.turn() === "b";

    if (piece && piece.color === game.turn() && isPlayerTurn) {
      setSelectedSquare(square);
      const moves = game.moves({ square: square as any, verbose: true });
      const sq: Record<string, React.CSSProperties> = {
        [square]: { background: `${config.accentPrimary}55`, borderRadius: "4px" },
      };
      moves.forEach((m: any) => {
        sq[m.to] = game.get(m.to as any)
          ? { background: "rgba(239,68,68,0.35)", borderRadius: "50%" }
          : { background: "rgba(100,200,240,0.3)", borderRadius: "50%" };
      });
      setLegalSquares(sq);
      return;
    }
    if (selectedSquare && legalSquares[square]) {
      handleMove(selectedSquare, square);
      return;
    }
    setSelectedSquare(null);
    setLegalSquares({});
  }, [status, challenge, game, selectedSquare, legalSquares, config, handleMove]);

  // ── Hint ───────────────────────────────────────────────────────────────────
  const requestHint = async () => {
    if (!challenge || loadingHint) return;
    setLoadingHint(true);
    try {
      const res = await getChallengeHint(
        challenge.id, hints.length,
        challenge.fen, challenge.theme, difficulty, challenge.best_move_san
      );
      if (res?.hint && !hints.includes(res.hint)) {
        setHints(prev => [...prev, res.hint]);
      }
    } catch { /* silent */ }
    setLoadingHint(false);
  };

  const retryChallenge = () => {
    if (!challenge) return;
    setGame(new Chess(challenge.fen));
    setStatus("playing");
    setValidation(null);
    setExplanation("");
    setHighlightSquares({});
    setSelectedSquare(null);
    setLegalSquares({});
  };

  const isWhitePuzzle = challenge ? new Chess(challenge.fen).turn() === "w" : true;
  const diffMeta = DIFF_META[difficulty];
  const mergedSquares = Object.keys(legalSquares).length > 0 ? legalSquares : highlightSquares;

  // PV line to display
  const pvLine = validation?.line?.length ? validation.line : challenge?.pv_line || [];

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: config.background, color: config.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
      {/* Back nav */}
      <div style={{ width: "60px", borderRight: `1px solid ${config.glassBorder}`, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0", background: config.glassBg, backdropFilter: "blur(12px)", position: "sticky", top: 0, height: "100vh" }}>
        <button onClick={() => router.push("/")} title="Back" style={{ background: "transparent", border: "none", fontSize: "1.4rem", cursor: "pointer", color: config.textSecondary, marginBottom: "20px" }}>←</button>
        <span style={{ fontSize: "1.4rem" }}>⚔️</span>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h1 style={{ margin: "0 0 4px", fontSize: "1.8rem", fontWeight: 700 }}>⚔️ Puzzle Challenge</h1>
              <p style={{ margin: 0, fontSize: "0.82rem", color: config.textSecondary }}>
                Stockfish-generated puzzles · AI-powered hints and analysis
              </p>
            </div>

            {/* Streaks */}
            <div style={{ display: "flex", gap: "12px" }}>
              {[
                { label: "Streak", val: streaks.current, icon: "🔥" },
                { label: "Best", val: streaks.best, icon: "🏆" },
                { label: "Solved", val: streaks.total, icon: "✓" },
              ].map(s => (
                <div key={s.label} style={{ background: config.glassBg, border: `1px solid ${config.glassBorder}`, borderRadius: "10px", padding: "10px 16px", textAlign: "center", minWidth: "70px" }}>
                  <div style={{ fontSize: "1.2rem" }}>{s.icon}</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{s.val}</div>
                  <div style={{ fontSize: "0.65rem", color: config.textSecondary }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Difficulty selector */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
            {(["easy", "medium", "hard"] as Difficulty[]).map(d => {
              const m = DIFF_META[d];
              return (
                <button key={d} onClick={() => setDifficulty(d)}
                  style={{ padding: "8px 20px", borderRadius: "20px", border: `1px solid ${difficulty === d ? m.color : config.glassBorder}`, background: difficulty === d ? `${m.color}22` : "transparent", color: difficulty === d ? m.color : config.textSecondary, cursor: "pointer", fontWeight: difficulty === d ? 600 : 400, fontSize: "0.85rem", transition: "all 0.2s" }}>
                  {m.icon} {m.label}
                </button>
              );
            })}
            <span style={{ fontSize: "0.75rem", color: config.textSecondary, alignSelf: "center", marginLeft: "8px" }}>
              {diffMeta.desc}
            </span>
          </div>

          {error && (
            <div style={{ color: "#EF4444", padding: "12px 16px", background: "rgba(239,68,68,0.1)", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem" }}>
              ⚠ {error}
              <button onClick={() => loadChallenge(difficulty)} style={{ marginLeft: "12px", background: "transparent", border: "1px solid #EF4444", color: "#EF4444", padding: "4px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "0.75rem" }}>Retry</button>
            </div>
          )}

          {/* Board + Panel */}
          <div style={{ display: "flex", gap: "28px", alignItems: "flex-start", flexWrap: "wrap" }}>

            {/* Board */}
            <div style={{ flex: "0 0 auto" }}>
              {/* Whose turn label */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <span style={{ fontSize: "1.2rem" }}>{isWhitePuzzle ? "♙" : "♟"}</span>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{isWhitePuzzle ? "White" : "Black"} to move</span>
                {challenge?.generated && (
                  <span style={{ fontSize: "0.65rem", background: `${config.accentPrimary}22`, border: `1px solid ${config.accentPrimary}44`, color: config.accentPrimary, borderRadius: "10px", padding: "2px 8px" }}>
                    ⚡ Live
                  </span>
                )}
              </div>

              <div style={{ position: "relative", borderRadius: "10px", overflow: "hidden", boxShadow: "0 8px 48px rgba(0,0,0,0.4)" }}>
                <Chessboard
                  position={game.fen()}
                  onPieceDrop={onPieceDrop}
                  onSquareClick={onSquareClick}
                  boardWidth={480}
                  customSquareStyles={mergedSquares}
                  customDarkSquareStyle={{ backgroundColor: config.boardDark }}
                  customLightSquareStyle={{ backgroundColor: config.boardLight }}
                  boardOrientation={isWhitePuzzle ? "white" : "black"}
                  arePiecesDraggable={status === "playing"}
                />
                {(status === "loading" || status === "validating") && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px" }}>
                    <div style={{ width: "40px", height: "40px", border: `3px solid ${config.accentPrimary}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    <span style={{ color: "#fff", fontSize: "0.9rem", fontWeight: 600 }}>
                      {status === "loading" ? "Generating puzzle..." : "Analyzing..."}
                    </span>
                  </div>
                )}
              </div>

              {/* PV line */}
              {(status === "success" || status === "failed") && pvLine.length > 0 && (
                <div style={{ marginTop: "12px", background: config.glassBg, border: `1px solid ${config.glassBorder}`, borderRadius: "8px", padding: "10px 12px" }}>
                  <button onClick={() => setShowPv(v => !v)} style={{ background: "transparent", border: "none", color: config.textSecondary, cursor: "pointer", fontSize: "0.75rem", padding: 0, marginBottom: showPv ? "8px" : 0 }}>
                    {showPv ? "▼" : "▶"} Best continuation
                  </button>
                  {showPv && (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {pvLine.map((move, i) => (
                        <span key={i} style={{ background: i === 0 ? `${config.accentPrimary}22` : `${config.textSecondary}15`, border: `1px solid ${i === 0 ? `${config.accentPrimary}55` : config.glassBorder}`, color: i === 0 ? config.accentPrimary : config.textPrimary, borderRadius: "6px", padding: "3px 8px", fontSize: "0.78rem", fontWeight: i === 0 ? 700 : 400 }}>
                          {move}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right panel */}
            <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "14px", minWidth: "280px" }}>

              {/* Theme card */}
              {challenge && (
                <div style={{ background: config.glassBg, border: `1px solid ${config.glassBorder}`, borderRadius: "12px", padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                    <div>
                      <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: config.textSecondary, marginBottom: "4px" }}>Tactical Theme</div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: config.accentPrimary }}>
                        {challenge.theme_label || challenge.theme}
                      </div>
                    </div>
                    <span style={{ fontSize: "0.72rem", background: `${diffMeta.color}22`, border: `1px solid ${diffMeta.color}55`, color: diffMeta.color, borderRadius: "10px", padding: "3px 10px", fontWeight: 600 }}>
                      {diffMeta.label}
                    </span>
                  </div>
                  {challenge.theme_description && (
                    <p style={{ margin: "0 0 12px", fontSize: "0.78rem", color: config.textSecondary, lineHeight: 1.5 }}>
                      {challenge.theme_description}
                    </p>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.72rem", color: config.textSecondary }}>
                    <span>Eval:</span>
                    <span style={{ fontWeight: 600, color: config.textPrimary }}>{challenge.evaluation}</span>
                  </div>
                </div>
              )}

              {/* Result panel */}
              {(status === "success" || status === "failed") && validation && (
                <div style={{ background: status === "success" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${status === "success" ? "#22C55E55" : "#EF444455"}`, borderRadius: "12px", padding: "20px" }}>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, color: status === "success" ? "#22C55E" : "#EF4444", marginBottom: "10px" }}>
                    {status === "success" ? "🎉 Correct!" : "❌ Not quite"}
                  </div>

                  <div style={{ fontSize: "0.82rem", color: config.textPrimary, marginBottom: "10px", lineHeight: 1.5 }}>
                    {validation.message}
                  </div>

                  {/* Classification badge */}
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: `${config.textSecondary}15`, borderRadius: "8px", padding: "4px 10px", marginBottom: "12px" }}>
                    <span style={{ fontSize: "0.72rem", color: config.textSecondary }}>Your move:</span>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{validation.classification}</span>
                  </div>

                  {status === "failed" && (
                    <div style={{ fontSize: "0.8rem", color: config.textSecondary, marginBottom: "12px" }}>
                      Best was: <span style={{ color: "#22C55E", fontWeight: 700 }}>{validation.best_move_san || validation.best_move}</span>
                    </div>
                  )}

                  {/* AI explanation */}
                  {(explanation || loadingExplanation) && (
                    <div style={{ background: `${config.accentPrimary}10`, border: `1px solid ${config.accentPrimary}33`, borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
                      <div style={{ fontSize: "0.65rem", color: config.accentPrimary, marginBottom: "6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        ♔ Kasparov&apos;s Analysis
                      </div>
                      {loadingExplanation ? (
                        <div style={{ fontSize: "0.78rem", color: config.textSecondary, fontStyle: "italic" }}>Analyzing position...</div>
                      ) : (
                        <div style={{ fontSize: "0.82rem", color: config.textPrimary, lineHeight: 1.55 }}>{explanation}</div>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {status === "failed" && (
                      <button onClick={retryChallenge} style={{ flex: 1, padding: "9px 16px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#EF4444", borderRadius: "8px", fontWeight: 600, cursor: "pointer", fontSize: "0.82rem" }}>
                        ↺ Try Again
                      </button>
                    )}
                    <button onClick={() => loadChallenge(difficulty)} style={{ flex: 2, padding: "9px 16px", background: status === "success" ? "rgba(34,197,94,0.2)" : config.glassBg, border: `1px solid ${status === "success" ? "#22C55E55" : config.glassBorder}`, color: status === "success" ? "#22C55E" : config.textPrimary, borderRadius: "8px", fontWeight: 600, cursor: "pointer", fontSize: "0.82rem" }}>
                      Next Puzzle ➔
                    </button>
                  </div>
                </div>
              )}

              {/* Hints */}
              {status === "playing" && challenge && (
                <div style={{ background: config.glassBg, border: `1px solid ${config.glassBorder}`, borderRadius: "12px", padding: "16px" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "10px", display: "flex", justifyContent: "space-between" }}>
                    <span>💡 Hints</span>
                    <span style={{ fontSize: "0.65rem", color: config.textSecondary }}>{hints.length}/4 revealed</span>
                  </div>

                  {hints.map((hint, i) => (
                    <div key={i} className="coach-message-enter" style={{ background: `${config.accentSecondary}12`, border: `1px solid ${config.accentSecondary}33`, borderLeft: `3px solid ${config.accentSecondary}`, borderRadius: "6px", padding: "10px 12px", fontSize: "0.8rem", marginBottom: "8px", lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 600, color: config.accentSecondary, marginRight: "6px" }}>H{i + 1}</span>
                      {hint}
                    </div>
                  ))}

                  {hints.length < 4 && (
                    <button onClick={requestHint} disabled={loadingHint}
                      style={{ width: "100%", padding: "9px", background: "transparent", border: `1px dashed ${config.glassBorder}`, borderRadius: "8px", color: loadingHint ? config.textSecondary : config.accentPrimary, cursor: loadingHint ? "wait" : "pointer", fontSize: "0.8rem", transition: "all 0.2s" }}>
                      {loadingHint ? "Getting hint..." : `+ Reveal Hint ${hints.length + 1}`}
                    </button>
                  )}
                </div>
              )}

              {/* Skip button */}
              {(status === "playing" || status === "failed") && (
                <button onClick={() => loadChallenge(difficulty)}
                  style={{ width: "100%", padding: "10px", background: "transparent", border: `1px solid ${config.glassBorder}`, borderRadius: "8px", color: config.textSecondary, cursor: "pointer", fontSize: "0.82rem" }}>
                  Skip Puzzle ⏭
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideInFromLeft {
          from { transform: translateX(-10px); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        .coach-message-enter { animation: slideInFromLeft 0.22s ease-out; }
      `}</style>
    </div>
  );
}
