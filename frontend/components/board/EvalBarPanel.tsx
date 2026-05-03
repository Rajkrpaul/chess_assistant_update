import React from "react";
import { useGameStore } from "../../store/gameStore";
import { useTheme } from "../../context/ThemeContext";
import { useSettings } from "../../context/SettingsContext";

function evalToString(evaluation: number | null, mateIn: number | null): string {
  if (mateIn !== null) return mateIn > 0 ? `+M${Math.abs(mateIn)}` : `-M${Math.abs(mateIn)}`;
  if (evaluation === null) return "0.00";
  const pawns = evaluation / 100;
  return pawns >= 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
}

export function EvalBarPanel() {
  const { config } = useTheme();
  const { settings } = useSettings();
  const evaluation = useGameStore((s) => s.evaluation);

  if (!settings.showEvalBar) return null;

  const cp = evaluation?.evaluation ?? 0;
  const mateIn = evaluation?.mateIn ?? null;
  const evalStr = evalToString(evaluation?.evaluation ?? null, mateIn);

  // White fill: 0 = 50%, +600cp = 100%, -600cp = 0%
  const whitePct = mateIn !== null
    ? mateIn > 0 ? 100 : 0
    : Math.min(Math.max(((cp ?? 0) + 600) / 1200, 0), 1) * 100;

  return (
    <div
      style={{
        background: config.glassBg,
        border: `1px solid ${config.glassBorder}`,
        borderRadius: "10px",
        padding: "16px",
        display: "flex",
        gap: "20px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "0.55rem", color: config.textSecondary }}>+6</span>
        <div
          style={{
            height: "100px",
            width: "10px",
            borderRadius: "5px",
            background: config.evalBarBlack,
            border: `1px solid ${config.glassBorder}`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: `${whitePct}%`,
              background: config.evalBarWhite,
              transition: "height 0.35s ease",
            }}
          />
        </div>
        <span style={{ fontSize: "0.55rem", color: config.textSecondary }}>-6</span>
      </div>

      <div style={{ flex: 1 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: "0.8rem", fontWeight: 600 }}>Evaluation</h3>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "12px" }}>
          <span style={{ fontSize: "1.6rem", fontWeight: 700 }}>{evalStr}</span>
          <span
            style={{
              fontSize: "0.65rem",
              background: `${config.textSecondary}22`,
              padding: "2px 8px",
              borderRadius: "10px",
              color: config.textSecondary,
            }}
          >
            {(cp ?? 0) > 50 ? "White advantage" : (cp ?? 0) < -50 ? "Black advantage" : "Equal"}
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
          <div>
            <div style={{ fontSize: "0.65rem", color: config.textSecondary, marginBottom: "2px" }}>
              Best Move
            </div>
            <div style={{ fontSize: "0.85rem", color: "#22C55E", fontWeight: 600 }}>
              {evaluation?.bestMove ?? "N/A"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.65rem", color: config.textSecondary, marginBottom: "2px" }}>
              Depth
            </div>
            <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
              {evaluation?.depth ?? "—"}
            </div>
          </div>
        </div>

        <div
          style={{
            background: `${config.textSecondary}12`,
            borderRadius: "6px",
            padding: "6px 8px",
            fontSize: "0.7rem",
            color: config.textSecondary,
          }}
        >
          <div style={{ marginBottom: "2px", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Line
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", opacity: 0.85 }}>
            {evaluation?.bestMove ?? "..."}{" "}
            {evaluation?.secondBestMove ? `→ ${evaluation.secondBestMove}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
