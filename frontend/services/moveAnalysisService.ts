import { analyzeMoveContext } from "./api";
import { useGameStore } from "../store/gameStore";

export async function analyzeAndDispatch(
  fen_before: string,
  move_uci: string,
  ply: number,
  depth: number,
  skillLevel: number
): Promise<void> {
  try {
    const analysis = await analyzeMoveContext(fen_before, move_uci, ply, depth, skillLevel);
    useGameStore.getState().setMoveAnalysis(analysis);
    useGameStore.getState().setLastClassification({
      classification: analysis.classification,
      centipawn_loss: analysis.centipawn_loss,
      insight: analysis.insight,
      best_move_san: analysis.best_move_san,
      pv_line: analysis.pv_line,
      eval_before: analysis.eval_before,
      eval_after: analysis.eval_after,
    });
  } catch (e) {
    console.warn("[moveAnalysis] failed:", e);
  }
}
