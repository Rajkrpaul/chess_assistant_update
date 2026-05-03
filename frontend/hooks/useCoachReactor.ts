import { useEffect, useRef } from "react";
import { useGameStore } from "../store/gameStore";
import { useCoachStore } from "../store/coachStore";

export function useCoachReactor() {
  const addMessage = useCoachStore((s) => s.addMessage);
  const setTyping = useCoachStore((s) => s.setTyping);
  const setLastClassificationForSuggestions = useCoachStore(
    (s) => s.setLastClassificationForSuggestions
  );
  const lastFiredRef = useRef<number>(0);

  useEffect(() => {
    const unsub = useGameStore.subscribe(
      (state) => state.lastClassification,
      async (classification) => {
        if (!classification) return;
        const lastMove = useGameStore.getState().lastMoveEvent;
        if (!lastMove) return;
        // Deduplicate: ignore if same timestamp fired within 500ms
        if (lastMove.timestamp - lastFiredRef.current < 500) return;
        lastFiredRef.current = lastMove.timestamp;
        // Don't fire for AI moves in analysis mode
        const mode = useGameStore.getState().mode;
        if (mode === "analysis" && lastMove.player === "ai") return;

        setLastClassificationForSuggestions(classification.classification);
        setTyping(true);

        try {
          const res = await fetch("/api/coach", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "move_reaction",
              fen: lastMove.fen_after,
              move_san: lastMove.move_san,
              classification: classification.classification,
              centipawn_loss: classification.centipawn_loss,
              insight: classification.insight,
              best_move_san: classification.best_move_san,
              eval_before: classification.eval_before,
              eval_after: classification.eval_after,
              pv_line: classification.pv_line,
              player: lastMove.player,
              move_history_count: useGameStore.getState().plyCount,
            }),
          });
          const data = await res.json();
          const reply: string =
            data.reply ?? "Let's continue analyzing this position.";

          addMessage({
            type: "move_reaction",
            sender: "coach",
            text: reply,
            classification: classification.classification,
          });
        } catch {
          addMessage({
            type: "move_reaction",
            sender: "coach",
            text: "Keep playing — I'll comment on the key moments.",
            classification: classification.classification,
          });
        } finally {
          setTyping(false);
        }
      }
    );
    return unsub;
  }, [addMessage, setTyping, setLastClassificationForSuggestions]);
}
