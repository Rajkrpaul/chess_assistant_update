import React, { useEffect, useState, useRef } from "react";
import { MoveClassification, CLASSIFICATION_META } from "../../services/api";
import { useCoachStore } from "../../store/coachStore";

interface ReactionConfig {
  emoji: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  animClass: string;
  duration: number;
}

const REACTION_CONFIGS: Partial<Record<MoveClassification, ReactionConfig>> = {
  Brilliant: {
    emoji: "✨",
    label: "Brilliant!",
    color: "#00D4FF",
    bgColor: "rgba(0,212,255,0.12)",
    borderColor: "rgba(0,212,255,0.5)",
    animClass: "brilliant-burst",
    duration: 3500,
  },
  Great: {
    emoji: "★",
    label: "Great Move",
    color: "#22C55E",
    bgColor: "rgba(34,197,94,0.1)",
    borderColor: "rgba(34,197,94,0.4)",
    animClass: "reaction-enter",
    duration: 2500,
  },
  Best: {
    emoji: "★",
    label: "Best Move",
    color: "#22C55E",
    bgColor: "rgba(34,197,94,0.1)",
    borderColor: "rgba(34,197,94,0.4)",
    animClass: "reaction-enter",
    duration: 2000,
  },
  Excellent: {
    emoji: "✓",
    label: "Excellent",
    color: "#10B981",
    bgColor: "rgba(16,185,129,0.1)",
    borderColor: "rgba(16,185,129,0.4)",
    animClass: "reaction-enter",
    duration: 2000,
  },
  Good: {
    emoji: "✓",
    label: "Good",
    color: "#6EE7B7",
    bgColor: "rgba(110,231,183,0.08)",
    borderColor: "rgba(110,231,183,0.3)",
    animClass: "reaction-enter",
    duration: 1800,
  },
  Inaccuracy: {
    emoji: "?!",
    label: "Inaccuracy",
    color: "#F59E0B",
    bgColor: "rgba(245,158,11,0.1)",
    borderColor: "rgba(245,158,11,0.4)",
    animClass: "reaction-enter",
    duration: 3000,
  },
  Mistake: {
    emoji: "?",
    label: "Mistake",
    color: "#F97316",
    bgColor: "rgba(249,115,22,0.12)",
    borderColor: "rgba(249,115,22,0.5)",
    animClass: "blunder-shake",
    duration: 3500,
  },
  Blunder: {
    emoji: "??",
    label: "Blunder!",
    color: "#EF4444",
    bgColor: "rgba(239,68,68,0.12)",
    borderColor: "rgba(239,68,68,0.6)",
    animClass: "blunder-shake",
    duration: 4000,
  },
};

interface LiveReactionOverlayProps {
  classification: MoveClassification | null;
  moveSan: string;
  coachComment?: string;
  streak?: number;
  onDismiss?: () => void;
}

export function LiveReactionOverlay({
  classification,
  moveSan,
  coachComment,
  streak,
  onDismiss,
}: LiveReactionOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = classification ? REACTION_CONFIGS[classification] : null;

  useEffect(() => {
    if (!classification || !config) return;

    setVisible(true);
    setExiting(false);

    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(() => {
        setVisible(false);
        onDismiss?.();
      }, 280);
    }, config.duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [classification, moveSan]);

  if (!visible || !config || !classification) return null;

  const showParticles = classification === "Brilliant" || classification === "Great";

  return (
    <div
      style={{
        position: "absolute",
        top: "12px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      {/* Particles for brilliant */}
      {showParticles && (
        <div style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i / 8) * 360;
            const dx = Math.cos((angle * Math.PI) / 180) * 60;
            const dy = Math.sin((angle * Math.PI) / 180) * 60;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: config.color,
                  "--dx": `${dx}px`,
                  "--dy": `${dy}px`,
                  animation: "particleBurst 0.8s ease-out forwards",
                  animationDelay: `${i * 40}ms`,
                } as React.CSSProperties}
              />
            );
          })}
        </div>
      )}

      {/* Main reaction card */}
      <div
        className={exiting ? "reaction-exit" : config.animClass}
        onClick={() => {
          setExiting(true);
          setTimeout(() => { setVisible(false); onDismiss?.(); }, 280);
        }}
        style={{
          background: config.bgColor,
          border: `1px solid ${config.borderColor}`,
          borderRadius: "14px",
          padding: "12px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
          backdropFilter: "blur(16px)",
          boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${config.bgColor}`,
          minWidth: "180px",
          textAlign: "center",
          pointerEvents: "auto",
          cursor: "pointer",
        }}
      >
        {/* Icon + label */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "1.4rem" }}>{config.emoji}</span>
          <div>
            <div
              style={{
                fontSize: "0.95rem",
                fontWeight: 800,
                color: config.color,
                letterSpacing: "0.01em",
              }}
            >
              {config.label}
            </div>
            {moveSan && (
              <div
                style={{
                  fontSize: "0.72rem",
                  color: "rgba(255,255,255,0.6)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {moveSan}
              </div>
            )}
          </div>
        </div>

        {/* Coach comment */}
        {coachComment && (
          <div
            style={{
              fontSize: "0.72rem",
              color: "rgba(255,255,255,0.75)",
              lineHeight: 1.4,
              maxWidth: "220px",
              borderTop: `1px solid ${config.borderColor}`,
              paddingTop: "6px",
              marginTop: "2px",
            }}
          >
            {coachComment}
          </div>
        )}

        {/* Streak badge */}
        {streak !== undefined && streak >= 3 && (
          <div
            className="streak-pop"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "rgba(212,175,55,0.2)",
              border: "1px solid rgba(212,175,55,0.5)",
              borderRadius: "10px",
              padding: "2px 10px",
              fontSize: "0.68rem",
              color: "#D4AF37",
              fontWeight: 700,
            }}
          >
            🔥 {streak} move streak!
          </div>
        )}
      </div>
    </div>
  );
}
