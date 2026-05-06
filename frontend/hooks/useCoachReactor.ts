import { useEffect, useRef } from "react";
import { useGameStore } from "../store/gameStore";
import { useCoachStore } from "../store/coachStore";

const REACTION_COOLDOWN_MS = 800;
const IMPORTANT_CLASSIFICATIONS = new Set(["Blunder", "Mistake", "Brilliant", "Great", "Best", "Excellent"]);

export function useCoachReactor() {
  const addMessage = useCoachStore((s) => s.addMessage);
  const setTyping = useCoachStore((s) => s.setTyping);
  const setCoachState = useCoachStore((s) => s.setCoachState);
  const incrementStreak = useCoachStore((s) => s.incrementStreak);
  const resetStreak = useCoachStore((s) => s.resetStreak);
  const setLastClassificationForSuggestions = useCoachStore(
    (s) => s.setLastClassificationForSuggestions
  );
  const lastFiredRef = useRef<number>(0);
  const lastClassificationRef = useRef<string>("");

  useEffect(() => {
    // React to player move classifications
    const unsub = useGameStore.subscribe(
      (state) => state.lastClassification,
      async (classification) => {
        if (!classification) return;
        const lastMove = useGameStore.getState().lastMoveEvent;
        if (!lastMove) return;

        // Debounce rapid state changes
        if (Date.now() - lastFiredRef.current < REACTION_COOLDOWN_MS) return;
        lastFiredRef.current = Date.now();

        const mode = useGameStore.getState().mode;
        const isHumanMove = lastMove.player === "human";
        const isAiMove = lastMove.player === "ai";
        const cls = classification.classification;

        setLastClassificationForSuggestions(cls);

        // ── Human move → react
        if (isHumanMove) {
          // Update streak tracking
          const positiveClasses = ["Brilliant", "Great", "Best", "Excellent", "Good", "Book"];
          if (positiveClasses.includes(cls)) {
            incrementStreak();
          } else if (["Blunder", "Mistake"].includes(cls)) {
            resetStreak();
          }

          // Update coach avatar state
          if (cls === "Brilliant") setCoachState("impressed");
          else if (cls === "Blunder" || cls === "Mistake") setCoachState("disappointed");
          else if (cls === "Inaccuracy") setCoachState("teaching");
          else setCoachState("idle");

          // Skip reaction for AI or analysis non-important moves
          if (mode === "analysis" && !IMPORTANT_CLASSIFICATIONS.has(cls)) return;

          // Choose prompt mode based on classification severity
          let reactMode = "move_reaction";
          if (cls === "Blunder") reactMode = "blunder_intervention";
          else if (cls === "Brilliant") reactMode = "brilliant_celebration";

          setTyping(true);

          // Check opening phase (first 10 moves)
          const plyCount = useGameStore.getState().plyCount;
          const isOpening = plyCount <= 10;

          try {
            const res = await fetch("/api/coach", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: isOpening && cls === "Book" ? "opening_theory" : reactMode,
                fen: lastMove.fen_before,
                move_san: lastMove.move_san,
                classification: cls,
                centipawn_loss: classification.centipawn_loss,
                insight: classification.insight,
                best_move_san: classification.best_move_san,
                eval_before: classification.eval_before,
                eval_after: classification.eval_after,
                pv_line: classification.pv_line,
                player: "human",
                move_history_count: plyCount,
                move_number: Math.ceil(plyCount / 2),
              }),
            });
            const data = await res.json();
            const reply: string = data.reply ?? "Let's continue — keep playing well.";

            addMessage({
              type: cls === "Blunder" ? "blunder_intervention"
                   : cls === "Brilliant" ? "brilliant_celebration"
                   : "move_reaction",
              sender: "coach",
              text: reply,
              classification: cls,
            });

            // Reset coach state after teaching moment
            setTimeout(() => setCoachState("idle"), 5000);
          } catch {
            addMessage({
              type: "move_reaction",
              sender: "coach",
              text: "Keep playing — I'll comment on the key moments.",
              classification: cls,
            });
            setCoachState("idle");
          } finally {
            setTyping(false);
          }
        }

        // ── AI move → explain as if coach played it
        if (isAiMove && mode === "play") {
          // Only explain AI moves for significant moments
          if (!IMPORTANT_CLASSIFICATIONS.has(cls) && Math.random() > 0.4) return;

          setCoachState("thinking");

          try {
            const res = await fetch("/api/coach", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: "ai_move_explanation",
                move_san: lastMove.move_san,
                fen: lastMove.fen_after,
                insight: classification.insight,
                centipawn_advantage: classification.centipawn_loss
                  ? -classification.centipawn_loss
                  : undefined,
              }),
            });
            const data = await res.json();
            const reply: string = data.reply ?? `I played ${lastMove.move_san} — keep watching.`;

            addMessage({
              type: "ai_move",
              sender: "coach",
              text: reply,
            });

            setCoachState("idle");
          } catch {
            // Silent fail for AI move commentary
            setCoachState("idle");
          }
        }
      }
    );

    return unsub;
  }, [addMessage, setTyping, setCoachState, setLastClassificationForSuggestions, incrementStreak, resetStreak]);
}
