import { useEffect } from "react";
import { useGameStore } from "../store/gameStore";
import { engineOrchestrator } from "../services/engineOrchestrator";
import { useSettings } from "../context/SettingsContext";

export function useEngineSubscription() {
  const { settings } = useSettings();

  useEffect(() => {
    const unsub = useGameStore.subscribe(
      (state) => state.fen,
      (fen) => {
        engineOrchestrator.evaluate(fen, settings.depth, settings.skillLevel);
      }
    );
    return () => {
      unsub();
      engineOrchestrator.cancel();
    };
  }, [settings.depth, settings.skillLevel]);
}
