import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "../../context/ThemeContext";
import { useCoachStore, CoachMessage } from "../../store/coachStore";
import { useGameStore } from "../../store/gameStore";
import { CLASSIFICATION_META, MoveClassification } from "../../services/api";

const STATIC_SUGGESTIONS = [
  "Best opening for white?",
  "How do I avoid blunders?",
  "Explain the Sicilian Defense",
  "Tips for the endgame",
];

const CLASSIFICATION_SUGGESTIONS: Partial<Record<MoveClassification, string[]>> = {
  Blunder: ["Why was that a blunder?", "Show me the punishment", "What should I have played?"],
  Mistake: ["Why was that a mistake?", "What was the better move?", "How do I avoid this?"],
  Inaccuracy: ["What was the inaccuracy?", "What's the improvement?"],
  Brilliant: ["Why is this brilliant?", "What's the follow-up plan?", "Explain the idea"],
  Great: ["Why was that great?", "What's the plan now?"],
  Excellent: ["Why was that excellent?", "What should I do next?"],
};

function KasparovAvatar({ size = 56, border }: { size?: number; border?: string }) {
  const [imgError, setImgError] = useState(false);
  const { config } = useTheme();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        overflow: "hidden",
        border: border ?? `2px solid ${config.accentPrimary}`,
        background: "linear-gradient(135deg,#1a1a2e,#16213e)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* eslint-disable @next/next/no-img-element */}
      {!imgError ? (
        <img
          src="/kasparov_coach.png"
          alt="Kasparov"
          onError={() => setImgError(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span style={{ fontSize: size * 0.45 }}>♔</span>
      )}
    </div>
  );
}

function classificationBorderColor(cls?: MoveClassification): string | undefined {
  if (!cls) return undefined;
  const meta = CLASSIFICATION_META[cls];
  return meta?.color;
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
        gap: "10px",
        alignSelf: isCoach ? "flex-start" : "flex-end",
        maxWidth: "90%",
        alignItems: "flex-end",
      }}
    >
      {isCoach && <KasparovAvatar size={26} border={`1px solid ${config.accentPrimary}55`} />}
      <div>
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
                fontSize: "0.65rem",
                fontWeight: 700,
              }}
            >
              {CLASSIFICATION_META[msg.classification].icon} {CLASSIFICATION_META[msg.classification].label}
            </span>
          </div>
        )}
        <div
          style={{
            background: isCoach ? `${config.textSecondary}12` : `${config.accentPrimary}33`,
            border: `1px solid ${isCoach ? config.glassBorder : `${config.accentPrimary}55`}`,
            borderLeft: borderColor ? `3px solid ${borderColor}` : undefined,
            padding: "10px 14px",
            borderRadius: "12px",
            borderBottomLeftRadius: isCoach ? "2px" : "12px",
            borderBottomRightRadius: !isCoach ? "2px" : "12px",
            fontSize: "0.79rem",
            lineHeight: 1.55,
          }}
        >
          {msg.text === "…" ? (
            <span style={{ letterSpacing: "0.2em", opacity: 0.6, fontSize: "1rem" }}>⋯</span>
          ) : (
            msg.text
          )}
        </div>
      </div>
    </div>
  );
}

export default function CoachPanel({ onTabActive }: { onTabActive?: () => void }) {
  const { config } = useTheme();
  const messages = useCoachStore((s) => s.messages);
  const isTyping = useCoachStore((s) => s.isTyping);
  const addMessage = useCoachStore((s) => s.addMessage);
  const addToHistory = useCoachStore((s) => s.addToHistory);
  const conversationHistory = useCoachStore((s) => s.conversationHistory);
  const lastClassForSuggestions = useCoachStore((s) => s.lastClassificationForSuggestions);
  const clearUnread = useCoachStore((s) => s.clearUnread);

  const fen = useGameStore((s) => s.fen);
  const evaluation = useGameStore((s) => s.evaluation);
  const lastClassification = useGameStore((s) => s.lastClassification);

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    clearUnread();
  }, [clearUnread]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isSending) return;
    setInput("");
    setIsSending(true);

    addMessage({ type: "user_question", sender: "user", text });
    addToHistory("user", text);
    useCoachStore.getState().setTyping(true);

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
          message: text,
          history: conversationHistory.slice(-10),
          fen,
          eval: evalStr,
          last_classification: lastClassification?.classification,
        }),
      });
      const data = await res.json();
      const reply = data.reply ?? "Please try again.";
      addMessage({ type: "coach_reply", sender: "coach", text: reply });
      addToHistory("assistant", reply);
    } catch {
      addMessage({ type: "coach_reply", sender: "coach", text: "Connection error. Please try again." });
    } finally {
      useCoachStore.getState().setTyping(false);
      setIsSending(false);
    }
  };

  const suggestions =
    lastClassForSuggestions && CLASSIFICATION_SUGGESTIONS[lastClassForSuggestions]
      ? CLASSIFICATION_SUGGESTIONS[lastClassForSuggestions]!
      : STATIC_SUGGESTIONS;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "'DM Sans', sans-serif", color: config.textPrimary }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "16px", borderBottom: `1px solid ${config.glassBorder}`, gap: "12px" }}>
        <KasparovAvatar size={48} />
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>Kasparov</h3>
            <span style={{ color: "#3B82F6", fontSize: "0.8rem" }}>✔</span>
          </div>
          <div style={{ fontSize: "0.7rem", color: config.textSecondary }}>
            World Chess Champion · Reacts to every move
          </div>
        </div>
      </div>

      {/* Chat */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {isTyping && (
          <div className="coach-message-enter" style={{ display: "flex", gap: "10px", alignSelf: "flex-start", alignItems: "flex-end" }}>
            <KasparovAvatar size={26} border={`1px solid ${config.accentPrimary}55`} />
            <div style={{ background: `${config.textSecondary}12`, border: `1px solid ${config.glassBorder}`, padding: "10px 14px", borderRadius: "12px", borderBottomLeftRadius: "2px", fontSize: "0.79rem", opacity: 0.7 }}>
              <span style={{ letterSpacing: "0.2em", fontSize: "1rem" }}>⋯</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "12px 14px", borderTop: `1px solid ${config.glassBorder}` }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleSend(s)}
              disabled={isSending}
              style={{
                background: "transparent",
                border: `1px solid ${config.glassBorder}`,
                color: config.textSecondary,
                padding: "4px 9px",
                borderRadius: "14px",
                fontSize: "0.67rem",
                cursor: isSending ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                opacity: isSending ? 0.5 : 1,
                transition: "all 0.15s",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", background: `${config.textSecondary}10`, borderRadius: "8px", padding: "8px 12px", border: `1px solid ${config.glassBorder}` }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend(input)}
            placeholder="Ask Kasparov anything..."
            disabled={isSending}
            style={{ flex: 1, background: "transparent", border: "none", color: config.textPrimary, outline: "none", fontSize: "0.78rem" }}
          />
          <button
            onClick={() => handleSend(input)}
            disabled={isSending || !input.trim()}
            style={{ background: "transparent", border: "none", color: isSending || !input.trim() ? config.textSecondary : config.accentPrimary, cursor: isSending || !input.trim() ? "not-allowed" : "pointer", fontSize: "1rem" }}
          >
            {isSending ? "⏳" : "➤"}
          </button>
        </div>

        <div style={{ textAlign: "center", fontSize: "0.59rem", color: config.textSecondary, marginTop: "6px", opacity: 0.6 }}>
          ⚡ Powered by Groq · Responses may be inaccurate
        </div>
      </div>
    </div>
  );
}
