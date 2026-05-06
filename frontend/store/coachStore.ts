import { create } from "zustand";
import type { MoveClassification } from "../services/api";
import type { CoachAvatarState } from "../components/coach/CoachAvatar";

export type CoachMessageType =
  | "welcome"
  | "move_reaction"
  | "ai_move"
  | "user_question"
  | "coach_reply"
  | "blunder_intervention"
  | "brilliant_celebration"
  | "streak_milestone";

export interface CoachMessage {
  id: string;
  type: CoachMessageType;
  sender: "coach" | "user";
  text: string;
  classification?: MoveClassification;
  timestamp: number;
}

interface CoachState {
  messages: CoachMessage[];
  isTyping: boolean;
  unreadCount: number;
  lastClassificationForSuggestions: MoveClassification | null;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  coachState: CoachAvatarState;
  // Streak tracking
  currentStreak: number;
  bestStreak: number;
  totalPuzzlesSolved: number;

  addMessage: (msg: Omit<CoachMessage, "id" | "timestamp">) => void;
  setTyping: (v: boolean) => void;
  clearUnread: () => void;
  setLastClassificationForSuggestions: (c: MoveClassification | null) => void;
  replaceMessage: (id: string, patch: Partial<CoachMessage>) => void;
  clearMessages: () => void;
  addToHistory: (role: "user" | "assistant", content: string) => void;
  setCoachState: (state: CoachAvatarState) => void;
  incrementStreak: () => void;
  resetStreak: () => void;
  incrementPuzzlesSolved: () => void;
}

export const useCoachStore = create<CoachState>((set) => ({
  messages: [
    {
      id: "welcome",
      type: "welcome",
      sender: "coach",
      text: "♟ Welcome! I'm Garry Kasparov — 13th World Chess Champion and your personal coach. I watch every move, react to every decision, and teach you to think like a grandmaster. Start a game, or ask me anything about chess!",
      timestamp: Date.now(),
    },
  ],
  isTyping: false,
  unreadCount: 0,
  lastClassificationForSuggestions: null,
  conversationHistory: [],
  coachState: "idle",
  currentStreak: 0,
  bestStreak: 0,
  totalPuzzlesSolved: 0,

  addMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { ...msg, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, timestamp: Date.now() },
      ],
      unreadCount: s.unreadCount + (msg.sender === "coach" ? 1 : 0),
    })),

  setTyping: (v) => set({ isTyping: v }),
  clearUnread: () => set({ unreadCount: 0 }),
  setLastClassificationForSuggestions: (c) =>
    set({ lastClassificationForSuggestions: c }),
  replaceMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

  clearMessages: () =>
    set({
      messages: [
        {
          id: "welcome",
          type: "welcome",
          sender: "coach",
          text: "♟ I'm Kasparov — let's play and improve together. Make a move or ask me anything!",
          timestamp: Date.now(),
        },
      ],
      conversationHistory: [],
      unreadCount: 0,
      coachState: "idle",
    }),

  addToHistory: (role, content) =>
    set((s) => ({
      conversationHistory: [
        ...s.conversationHistory.slice(-18),
        { role, content },
      ],
    })),

  setCoachState: (state) => set({ coachState: state }),

  incrementStreak: () =>
    set((s) => {
      const newStreak = s.currentStreak + 1;
      return {
        currentStreak: newStreak,
        bestStreak: Math.max(s.bestStreak, newStreak),
      };
    }),

  resetStreak: () => set({ currentStreak: 0 }),

  incrementPuzzlesSolved: () =>
    set((s) => ({ totalPuzzlesSolved: s.totalPuzzlesSolved + 1 })),
}));
