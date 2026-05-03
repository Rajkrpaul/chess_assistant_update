import { getEvaluation } from "./stockfishService";
import { useGameStore } from "../store/gameStore";

class EngineOrchestrator {
  private currentFen = "";
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  evaluate(fen: string, depth: number, skillLevel: number): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this._run(fen, depth, skillLevel), 150);
  }

  private async _run(fen: string, depth: number, skillLevel: number) {
    this.currentFen = fen;
    useGameStore.getState().setEngineRunning(true);
    try {
      const result = await getEvaluation(fen, depth, skillLevel);
      if (fen === this.currentFen) {
        useGameStore.getState().setEvaluation(result);
      }
    } catch {
      useGameStore.getState().setEngineRunning(false);
    }
  }

  cancel(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.currentFen = "";
  }
}

export const engineOrchestrator = new EngineOrchestrator();
