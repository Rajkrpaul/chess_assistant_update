import React, { useState } from "react";
import { useTheme } from "../../context/ThemeContext";

interface Props {
  fen: string;
  onClose: () => void;
}

export function SavePositionModal({ fen, onClose }: Props) {
  const { config } = useTheme();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Custom");

  const handleSave = () => {
    if (!title.trim()) return;
    const newPos = {
      id: "custom-" + Date.now(),
      title,
      fen,
      category,
      difficulty: "Unrated",
      favorite: false,
      timestamp: Date.now(),
    };
    const saved = localStorage.getItem("chessSavedPositions");
    const positions = saved ? JSON.parse(saved) : [];
    localStorage.setItem("chessSavedPositions", JSON.stringify([...positions, newPos]));
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: config.glassBg,
          backdropFilter: "blur(20px)",
          border: `1px solid ${config.glassBorder}`,
          borderRadius: "12px",
          padding: "24px",
          width: "320px",
          color: config.textPrimary,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <h3 style={{ margin: "0 0 16px", fontSize: "1rem", fontWeight: 700 }}>
          🔖 Save Position
        </h3>
        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "0.75rem", color: config.textSecondary, display: "block", marginBottom: "4px" }}>
            Title
          </label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="e.g., Sicilian Dragon Trap"
            style={{
              width: "100%",
              background: `${config.textSecondary}12`,
              border: `1px solid ${config.glassBorder}`,
              borderRadius: "6px",
              padding: "8px 10px",
              color: config.textPrimary,
              fontSize: "0.82rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "0.75rem", color: config.textSecondary, display: "block", marginBottom: "4px" }}>
            Category
          </label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g., Opening Trap, Endgame"
            style={{
              width: "100%",
              background: `${config.textSecondary}12`,
              border: `1px solid ${config.glassBorder}`,
              borderRadius: "6px",
              padding: "8px 10px",
              color: config.textPrimary,
              fontSize: "0.82rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "8px",
              borderRadius: "8px",
              border: `1px solid ${config.glassBorder}`,
              background: "transparent",
              color: config.textSecondary,
              cursor: "pointer",
              fontSize: "0.82rem",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            style={{
              flex: 1,
              padding: "8px",
              borderRadius: "8px",
              border: "none",
              background: title.trim() ? config.accentPrimary : `${config.textSecondary}33`,
              color: title.trim() ? "#000" : config.textSecondary,
              cursor: title.trim() ? "pointer" : "not-allowed",
              fontWeight: 600,
              fontSize: "0.82rem",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
