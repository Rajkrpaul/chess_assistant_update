import React, { useEffect, useState, useRef } from "react";
import { useGameStore } from "../../store/gameStore";
import { CLASSIFICATION_META } from "../../services/api";

export function MoveClassificationToast() {
  const lastClassification = useGameStore((s) => s.lastClassification);
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<typeof lastClassification>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!lastClassification) return;
    const { classification } = lastClassification;
    if (!["Blunder", "Mistake", "Inaccuracy", "Brilliant", "Great"].includes(classification)) {
      setVisible(false);
      return;
    }
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setCurrent(lastClassification);
    setVisible(true);
    dismissTimer.current = setTimeout(() => setVisible(false), 4000);
    return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); };
  }, [lastClassification]);

  if (!visible || !current) return null;

  const meta = CLASSIFICATION_META[current.classification];
  const isPositive = ["Brilliant", "Great", "Excellent"].includes(current.classification);

  return (
    <div
      className="move-toast-enter"
      style={{
        position: "absolute",
        top: "8px",
        right: "8px",
        background: `${meta.color}18`,
        border: `1px solid ${meta.color}55`,
        backdropFilter: "blur(12px)",
        borderRadius: "10px",
        padding: "10px 14px",
        zIndex: 50,
        minWidth: "180px",
        maxWidth: "240px",
        pointerEvents: "none",
        boxShadow: `0 0 20px ${meta.color}22`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <span style={{ color: meta.color, fontWeight: 700, fontSize: "0.85rem" }}>
          {meta.icon} {meta.label}
        </span>
        {current.centipawn_loss > 0 && !isPositive && (
          <span style={{ color: meta.color, fontSize: "0.72rem", opacity: 0.9 }}>
            -{(current.centipawn_loss / 100).toFixed(2)}
          </span>
        )}
      </div>
      {!isPositive && current.best_move_san && (
        <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}>
          Best was: <span style={{ color: "#22C55E", fontWeight: 600 }}>{current.best_move_san}</span>
        </div>
      )}
    </div>
  );
}
