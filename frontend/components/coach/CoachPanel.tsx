import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTheme } from "../../context/ThemeContext";
import { useCoachStore, CoachMessage } from "../../store/coachStore";
import { useGameStore } from "../../store/gameStore";
import { CLASSIFICATION_META, MoveClassification } from "../../services/api";
import { CoachAvatar, CoachAvatarState } from "./CoachAvatar";

// ── Suggestion chips ──────────────────────────────────────────────────────────

const STATIC_SUGGESTIONS = [
  "Best opening for white?",
  "How do I avoid blunders?",
  "Explain the Sicilian Defense",
  "Tips for the endgame",
];

const CLASSIFICATION_SUGGESTIONS: Partial<Record<MoveClassification, string[]>> = {
  Blunder:   ["Why was that a blunder?", "Show me the punishment", "What should I have played?"],
  Mistake:   ["Why was that a mistake?", "What was the better move?", "How do I avoid this?"],
  Inaccuracy:["What was the inaccuracy?", "What's the improvement?"],
  Brilliant: ["Why is this brilliant?", "What's the follow-up plan?", "Explain the idea"],
  Great:     ["Why was that great?", "What's the plan now?"],
  Excellent: ["What should I do next?", "Explain the strategic idea"],
};

// ── Message bubble ────────────────────────────────────────────────────────────

function classificationBorderColor(cls?: MoveClassification): string | undefined {
  if (!cls) return undefined;
  return CLASSIFICATION_META[cls]?.color;
}

function MessageBubble({ msg }: { msg: CoachMessage }) {
  const { config } = useTheme();
  const isCoach = msg.sender === "coach";
  const borderColor = isCoach && msg.classification
    ? classificationBorderColor(msg.classification)
    : undefined;

  return (
    <div
      className="coach-message-enter"
      style={{
        display: "flex",
        gap: "8px",
        alignSelf: isCoach ? "flex-start" : "flex-end",
        maxWidth: "92%",
        alignItems: "flex-end",
      }}
    >
      {isCoach && (
        <CoachAvatar
          size={24}
          state={msg.classification === "Blunder" ? "disappointed" : msg.classification === "Brilliant" ? "impressed" : "idle"}
          border={`1px solid ${config.accentPrimary}44`}
        />
      )}
      <div style={{ maxWidth: "100%" }}>
        {isCoach && msg.classification && (
          <div style={{ marginBottom: "4px" }}>
            <span
              className="classification-badge"
              style={{
                background: `${CLASSIFICATION_META[msg.classification].color}22`,
                border: `1px solid ${CLASSIFICATION_META[msg.classification].color}55`,
                color: CLASSIFICATION_META[msg.classification].color,
                borderRadius: "10px",
                padding: "2px 8px",
                fontSize: "0.62rem",
                fontWeight: 700,
                display: "inline-block",
              }}
            >
              {CLASSIFICATION_META[msg.classification].icon}{" "}
              {CLASSIFICATION_META[msg.classification].label}
            </span>
          </div>
        )}
        <div
          style={{
            background: isCoach
              ? `${config.textSecondary}10`
              : `${config.accentPrimary}30`,
            border: `1px solid ${
              isCoach
                ? borderColor
                  ? `${borderColor}40`
                  : config.glassBorder
                : `${config.accentPrimary}55`
            }`,
            borderLeft: borderColor && isCoach ? `3px solid ${borderColor}` : undefined,
            padding: "10px 13px",
            borderRadius: "12px",
            borderBottomLeftRadius: isCoach ? "3px" : "12px",
            borderBottomRightRadius: !isCoach ? "3px" : "12px",
            fontSize: "0.79rem",
            lineHeight: 1.6,
            color: config.textPrimary,
            wordBreak: "break-word",
          }}
        >
          {msg.text === "…" ? (
            <div style={{ display: "flex", gap: "4px", alignItems: "center", padding: "2px 0" }}>
              <span className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: config.accentPrimary, display: "inline-block" }} />
              <span className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: config.accentPrimary, display: "inline-block" }} />
              <span className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: config.accentPrimary, display: "inline-block" }} />
            </div>
          ) : (
            msg.text
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main CoachPanel ───────────────────────────────────────────────────────────

export default function CoachPanel({ onTabActive }: { onTabActive?: () => void }) {
  const { config } = useTheme();
  const messages          = useCoachStore((s) => s.messages);
  const isTyping          = useCoachStore((s) => s.isTyping);
  const addMessage        = useCoachStore((s) => s.addMessage);
  const addToHistory      = useCoachStore((s) => s.addToHistory);
  const conversationHistory = useCoachStore((s) => s.conversationHistory);
  const lastClassForSuggestions = useCoachStore((s) => s.lastClassificationForSuggestions);
  const clearUnread       = useCoachStore((s) => s.clearUnread);
  const coachState        = useCoachStore((s) => s.coachState);

  const fen               = useGameStore((s) => s.fen);
  const evaluation        = useGameStore((s) => s.evaluation);
  const lastClassification = useGameStore((s) => s.lastClassification);
  const mode              = useGameStore((s) => s.mode);

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Clear unread when panel opens
  useEffect(() => {
    clearUnread();
  }, [clearUnread]);

  const handleSend = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setInput("");
    setIsSending(true);

    addMessage({ type: "user_question", sender: "user", text: trimmed });
    addToHistory("user", trimmed);
    useCoachStore.getState().setTyping(true);
    useCoachStore.getState().setCoachState("thinking");

    const evalStr = evaluation
      ? evaluation.mateIn !== null
        ? `#${evaluation.mateIn}`
        : `${((evaluation.evaluation ?? 0) / 100).toFixed(2)}`
      : "unknown";

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "user_question",
          message: trimmed,
          history: conversationHistory.slice(-10),
          fen,
          eval: evalStr,
          last_classification: lastClassification?.classification,
          game_mode: mode,
        }),
      });
      const data = await res.json();
      const reply = data.reply ?? "Please try again.";
      addMessage({ type: "coach_reply", sender: "coach", text: reply });
      addToHistory("assistant", reply);
      useCoachStore.getState().setCoachState("teaching");
      // Reset to idle after teaching moment
      setTimeout(() => useCoachStore.getState().setCoachState("idle"), 4000);
    } catch {
      addMessage({
        type: "coach_reply",
        sender: "coach",
        text: "Connection error — please try again.",
      });
      useCoachStore.getState().setCoachState("idle");
    } finally {
      useCoachStore.getState().setTyping(false);
      setIsSending(false);
    }
  }, [isSending, addMessage, addToHistory, conversationHistory, fen, evaluation, lastClassification, mode]);

  const suggestions =
    lastClassForSuggestions && CLASSIFICATION_SUGGESTIONS[lastClassForSuggestions]
      ? CLASSIFICATION_SUGGESTIONS[lastClassForSuggestions]!
      : STATIC_SUGGESTIONS;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "'DM Sans', 'Inter', sans-serif",
        color: config.textPrimary,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "14px 16px",
          borderBottom: `1px solid ${config.glassBorder}`,
          gap: "12px",
          background: `${config.accentPrimary}06`,
        }}
      >
        <CoachAvatar size={48} state={coachState ?? "idle"} showRing />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>Kasparov</h3>
            <span style={{ color: "#3B82F6", fontSize: "0.85rem" }}>✔</span>
            <span
              style={{
                fontSize: "0.6rem",
                background: "rgba(34,197,94,0.15)",
                border: "1px solid rgba(34,197,94,0.3)",
                color: "#22C55E",
                borderRadius: "8px",
                padding: "1px 6px",
                fontWeight: 600,
              }}
            >
              LIVE
            </span>
          </div>
          <div style={{ fontSize: "0.68rem", color: config.textSecondary, marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {coachState === "thinking" ? "Thinking…" :
             coachState === "teaching" ? "Teaching mode" :
             coachState === "impressed" ? "Impressed!" :
             coachState === "disappointed" ? "Let's review this…" :
             "World Champion · Reacts to every move"}
          </div>
        </div>
      </div>

      {/* ── Chat area ──────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {isTyping && (
          <div
            className="coach-message-enter"
            style={{ display: "flex", gap: "8px", alignSelf: "flex-start", alignItems: "flex-end" }}
          >
            <CoachAvatar size={24} state="thinking" border={`1px solid ${config.accentPrimary}44`} />
            <div
              style={{
                background: `${config.textSecondary}10`,
                border: `1px solid ${config.glassBorder}`,
                padding: "10px 14px",
                borderRadius: "12px",
                borderBottomLeftRadius: "3px",
              }}
            >
              <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                <span className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: config.accentPrimary, display: "inline-block" }} />
                <span className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: config.accentPrimary, display: "inline-block" }} />
                <span className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: config.accentPrimary, display: "inline-block" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* ── Suggestions ────────────────────────────────────────────────────── */}
      <div style={{ padding: "8px 14px 0", display: "flex", flexWrap: "wrap", gap: "5px" }}>
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => handleSend(s)}
            disabled={isSending}
            style={{
              background: "transparent",
              border: `1px solid ${config.glassBorder}`,
              color: config.textSecondary,
              padding: "3px 9px",
              borderRadius: "14px",
              fontSize: "0.65rem",
              cursor: isSending ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              opacity: isSending ? 0.5 : 1,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = `${config.accentPrimary}66`;
              (e.currentTarget as HTMLButtonElement).style.color = config.accentPrimary;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = config.glassBorder;
              (e.currentTarget as HTMLButtonElement).style.color = config.textSecondary;
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* ── Input ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 14px 14px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: `${config.textSecondary}08`,
            borderRadius: "10px",
            padding: "8px 12px",
            border: `1px solid ${config.glassBorder}`,
            transition: "border-color 0.2s",
          }}
          onClick={() => inputRef.current?.focus()}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend(input)}
            placeholder="Ask about this position…"
            disabled={isSending}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: config.textPrimary,
              outline: "none",
              fontSize: "0.78rem",
            }}
          />
          <button
            onClick={() => handleSend(input)}
            disabled={isSending || !input.trim()}
            style={{
              background: input.trim() && !isSending ? config.accentPrimary : "transparent",
              border: "none",
              color: input.trim() && !isSending ? "#000" : config.textSecondary,
              cursor: isSending || !input.trim() ? "not-allowed" : "pointer",
              fontSize: "0.8rem",
              padding: "4px 8px",
              borderRadius: "6px",
              transition: "all 0.2s",
              fontWeight: 600,
            }}
          >
            {isSending ? "⏳" : "➤"}
          </button>
        </div>
        <div
          style={{
            textAlign: "center",
            fontSize: "0.58rem",
            color: config.textSecondary,
            marginTop: "6px",
            opacity: 0.55,
          }}
        >
          ⚡ Groq AI · Chess specialist only
        </div>
      </div>
    </div>
  );
}
