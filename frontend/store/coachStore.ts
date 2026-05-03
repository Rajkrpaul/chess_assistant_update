import { create } from "zustand";
import type { MoveClassification } from "../services/api";

export type CoachMessageType =
  | "welcome"
  | "move_reaction"
  | "user_question"
  | "coach_reply";

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
  addMessage: (msg: Omit<CoachMessage, "id" | "timestamp">) => void;
  setTyping: (v: boolean) => void;
  clearUnread: () => void;
  setLastClassificationForSuggestions: (c: MoveClassification | null) => void;
  replaceMessage: (id: string, patch: Partial<CoachMessage>) => void;
  clearMessages: () => void;
  addToHistory: (role: "user" | "assistant", content: string) => void;
}

export const useCoachStore = create<CoachState>((set) => ({
  messages: [
    {
      id: "welcome",
      type: "welcome",
      sender: "coach",
      text: "♟ Welcome! I'm Garry Kasparov — 13th World Chess Champion and your personal coach. I'll react to your moves in real time and help you improve. Make a move or ask me anything!",
      timestamp: Date.now(),
    },
  ],
  isTyping: false,
  unreadCount: 0,
  lastClassificationForSuggestions: null,
  conversationHistory: [],

  addMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { ...msg, id: Date.now().toString() + Math.random(), timestamp: Date.now() },
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
          text: "♟ Welcome! I'm Garry Kasparov — 13th World Chess Champion. Make a move or ask me anything!",
          timestamp: Date.now(),
        },
      ],
      conversationHistory: [],
      unreadCount: 0,
    }),
  addToHistory: (role, content) =>
    set((s) => ({
      conversationHistory: [
        ...s.conversationHistory.slice(-18),
        { role, content },
      ],
    })),
}));
