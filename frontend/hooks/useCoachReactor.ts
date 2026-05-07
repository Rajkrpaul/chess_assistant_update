import { useEffect, useRef } from "react";
import { useGameStore } from "../store/gameStore";
import { useCoachStore } from "../store/coachStore";

// Only react to these classifications — avoid spamming for every Good/Book move
const REACT_FOR_HUMAN = new Set(["Blunder", "Mistake", "Brilliant", "Great", "Inaccuracy"]);
const REACTION_COOLDOWN_MS = 2000; // increased to reduce spam

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
  const lastPlySentRef = useRef<number>(-1); // track which ply we last reacted to

  useEffect(() => {
    const unsub = useGameStore.subscribe(
      (state) => state.lastClassification,
      async (classification) => {
        if (!classification) return;
        const lastMove = useGameStore.getState().lastMoveEvent;
        if (!lastMove) return;

        // Skip if we already sent a reaction for this exact ply
        if (lastMove.ply === lastPlySentRef.current) return;

        // Debounce rapid state changes
        const now = Date.now();
        if (now - lastFiredRef.current < REACTION_COOLDOWN_MS) return;

        const mode = useGameStore.getState().mode;
        const isHumanMove = lastMove.player === "human";
        const cls = classification.classification;

        // Always update suggestion chips
        setLastClassificationForSuggestions(cls);

        // ── Human move reactions (play mode only, important classifications only)
        if (isHumanMove && mode === "play") {
          // Update streak tracking silently for all classifications
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

          // Only send a chat message for important classifications
          if (!REACT_FOR_HUMAN.has(cls)) {
            // Good/Excellent/Best/Book are silent — don't flood the chat
            setTimeout(() => setCoachState("idle"), 2000);
            return;
          }

          // Mark this ply as handled
          lastPlySentRef.current = lastMove.ply;
          lastFiredRef.current = now;

          const reactMode = cls === "Blunder" ? "blunder_intervention"
            : cls === "Brilliant" ? "brilliant_celebration"
            : "move_reaction";

          setTyping(true);
          const plyCount = useGameStore.getState().plyCount;

          try {
            const res = await fetch("/api/coach", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: reactMode,
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
            const reply: string = data.reply ?? "Keep playing — I'll comment on the key moments.";

            addMessage({
              type: cls === "Blunder" ? "blunder_intervention"
                   : cls === "Brilliant" ? "brilliant_celebration"
                   : "move_reaction",
              sender: "coach",
              text: reply,
              classification: cls,
            });

            setTimeout(() => setCoachState("idle"), 5000);
          } catch {
            // Silent fail — don't add error messages to chat
            setCoachState("idle");
          } finally {
            setTyping(false);
          }
        }

        // ── Analysis mode: only react to Blunder or Brilliant
        if (isHumanMove && mode === "analysis" && (cls === "Blunder" || cls === "Brilliant")) {
          if (lastMove.ply === lastPlySentRef.current) return;
          lastPlySentRef.current = lastMove.ply;
          lastFiredRef.current = now;

          setCoachState(cls === "Brilliant" ? "impressed" : "disappointed");
          setTyping(true);

          try {
            const res = await fetch("/api/coach", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: cls === "Blunder" ? "blunder_intervention" : "brilliant_celebration",
                fen: lastMove.fen_before,
                move_san: lastMove.move_san,
                classification: cls,
                centipawn_loss: classification.centipawn_loss,
                insight: classification.insight,
                best_move_san: classification.best_move_san,
              }),
            });
            const data = await res.json();
            addMessage({
              type: cls === "Blunder" ? "blunder_intervention" : "brilliant_celebration",
              sender: "coach",
              text: data.reply ?? "Interesting moment.",
              classification: cls,
            });
            setTimeout(() => setCoachState("idle"), 5000);
          } catch {
            setCoachState("idle");
          } finally {
            setTyping(false);
          }
        }

        // AI move commentary is intentionally disabled to prevent chat flooding
        // The coach reacts to what matters: human mistakes and brilliancies
      }
    );

    return unsub;
  }, [addMessage, setTyping, setCoachState, setLastClassificationForSuggestions, incrementStreak, resetStreak]);
}
