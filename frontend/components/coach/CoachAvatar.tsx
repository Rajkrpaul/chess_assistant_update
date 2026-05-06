import React, { useState, useEffect, useRef } from "react";
import { useTheme } from "../../context/ThemeContext";

export type CoachAvatarState =
  | "idle"
  | "thinking"
  | "impressed"
  | "disappointed"
  | "teaching";

interface CoachAvatarProps {
  size?: number;
  state?: CoachAvatarState;
  showRing?: boolean;
  border?: string;
}

export function CoachAvatar({
  size = 56,
  state = "idle",
  showRing = false,
  border,
}: CoachAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const { config } = useTheme();

  const ringColor: Record<CoachAvatarState, string> = {
    idle: "rgba(212,175,55,0.5)",
    thinking: "rgba(99,102,241,0.6)",
    impressed: "rgba(212,175,55,0.9)",
    disappointed: "rgba(239,68,68,0.5)",
    teaching: "rgba(59,130,246,0.6)",
  };

  const glowColor: Record<CoachAvatarState, string> = {
    idle: "rgba(212,175,55,0.2)",
    thinking: "rgba(99,102,241,0.3)",
    impressed: "rgba(212,175,55,0.6)",
    disappointed: "rgba(239,68,68,0.3)",
    teaching: "rgba(59,130,246,0.3)",
  };

  return (
    <div style={{ position: "relative", display: "inline-block", flexShrink: 0 }}>
      {/* Pulsing ring */}
      {showRing && (
        <div
          style={{
            position: "absolute",
            inset: -4,
            borderRadius: "50%",
            border: `2px solid ${ringColor[state]}`,
            animation: "pulseRing 2s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
      )}

      <div
        className={`coach-avatar-${state}`}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          overflow: "hidden",
          border: border ?? `2px solid ${ringColor[state]}`,
          background: "linear-gradient(135deg,#1a1a2e,#16213e)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "border-color 0.4s ease",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* eslint-disable @next/next/no-img-element */}
        {!imgError ? (
          <img
            src="/kasparov_coach.png"
            alt="Coach Kasparov"
            onError={() => setImgError(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span
            style={{
              fontSize: size * 0.45,
              filter: state === "impressed" ? "drop-shadow(0 0 8px gold)" : undefined,
            }}
          >
            ♔
          </span>
        )}

        {/* State overlay effect */}
        {state === "thinking" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(99,102,241,0.15)",
              borderRadius: "50%",
            }}
          />
        )}
        {state === "impressed" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(212,175,55,0.1)",
              borderRadius: "50%",
            }}
          />
        )}
      </div>

      {/* State indicator dot */}
      <div
        style={{
          position: "absolute",
          bottom: 2,
          right: 2,
          width: Math.max(8, size * 0.15),
          height: Math.max(8, size * 0.15),
          borderRadius: "50%",
          background: ringColor[state],
          border: "2px solid #0D0A07",
          zIndex: 2,
          transition: "background 0.3s ease",
          boxShadow: `0 0 6px ${glowColor[state]}`,
        }}
      />
    </div>
  );
}
