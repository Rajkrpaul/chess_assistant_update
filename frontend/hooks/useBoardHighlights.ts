import { useEffect } from "react";
import { useGameStore } from "../store/gameStore";

function uciToSquares(uci: string): { from: string; to: string } | null {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

export function useBoardHighlights() {
  const setHighlightSquares = useGameStore((s) => s.setHighlightSquares);

  useEffect(() => {
    const unsub = useGameStore.subscribe(
      (state) => state.lastClassification,
      (classification) => {
        if (!classification) return;
        const lastMove = useGameStore.getState().lastMoveEvent;
        if (!lastMove) return;

        const squares = uciToSquares(lastMove.move_uci);
        if (!squares) return;

        let color = "";
        const { classification: cls } = classification;
        if (cls === "Blunder") color = "rgba(239,68,68,0.45)";
        else if (cls === "Mistake") color = "rgba(249,115,22,0.4)";
        else if (cls === "Inaccuracy") color = "rgba(234,179,8,0.35)";
        else if (cls === "Brilliant" || cls === "Excellent" || cls === "Great")
          color = "rgba(34,197,94,0.4)";
        else return;

        setHighlightSquares({
          [squares.from]: { background: color, borderRadius: "4px" },
          [squares.to]: { background: color, borderRadius: "4px", boxShadow: `inset 0 0 12px ${color}` },
        });

        const timer = setTimeout(() => setHighlightSquares({}), 2500);
        return () => clearTimeout(timer);
      }
    );
    return unsub;
  }, [setHighlightSquares]);
}
