import React from "react";
import { useGameStore } from "../../store/gameStore";
import { useTheme } from "../../context/ThemeContext";

function evalToString(evaluation: number | null, mateIn: number | null): string {
  if (mateIn !== null) return `#${mateIn}`;
  if (evaluation === null) return "0.00";
  const pawns = evaluation / 100;
  return pawns >= 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
}

export function EngineLineCard() {
  const { config } = useTheme();
  const evaluation = useGameStore((s) => s.evaluation);
  const isEngineRunning = useGameStore((s) => s.isEngineRunning);

  if (!evaluation && !isEngineRunning) return null;

  const evalStr = evaluation
    ? evalToString(evaluation.evaluation, evaluation.mateIn)
    : "...";

  return (
    <div
      style={{
        background: config.glassBg,
        border: `1px solid ${config.glassBorder}`,
        borderRadius: "10px",
        padding: "12px",
        marginTop: "4px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: config.textPrimary }}>
          Engine Analysis
        </span>
        <span style={{ fontSize: "0.72rem", color: config.textSecondary }}>
          {isEngineRunning ? "calculating..." : `Depth ${evaluation?.depth ?? "?"}`}
        </span>
      </div>

      {evaluation && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: "#22C55E",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.72rem",
                flexShrink: 0,
              }}
            >
              ★
            </span>
            <span style={{ color: "#22C55E", fontWeight: 700, fontSize: "0.88rem" }}>
              {evaluation.bestMove ?? "N/A"}
            </span>
            <span
              style={{
                background: `${config.textSecondary}22`,
                padding: "2px 8px",
                borderRadius: "6px",
                fontSize: "0.78rem",
                fontWeight: 600,
              }}
            >
              {evalStr}
            </span>
          </div>

          {/* PV line — show up to 6 moves */}
          {evaluation.bestMove && (
            <div
              style={{
                background: `${config.textSecondary}10`,
                borderRadius: "6px",
                padding: "6px 8px",
                display: "flex",
                gap: "6px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "0.65rem", color: config.textSecondary, marginRight: "2px" }}>
                Line:
              </span>
              <span
                style={{
                  background: "#22C55E22",
                  border: "1px solid #22C55E55",
                  color: "#22C55E",
                  borderRadius: "4px",
                  padding: "2px 6px",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                }}
              >
                {evaluation.bestMove}
              </span>
              {evaluation.secondBestMove && (
                <span
                  style={{
                    background: `${config.textSecondary}18`,
                    border: `1px solid ${config.glassBorder}`,
                    color: config.textSecondary,
                    borderRadius: "4px",
                    padding: "2px 6px",
                    fontSize: "0.72rem",
                  }}
                >
                  {evaluation.secondBestMove}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
