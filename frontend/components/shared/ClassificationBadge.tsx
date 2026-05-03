import React from "react";
import { CLASSIFICATION_META, MoveClassification } from "../../services/api";

interface Props {
  classification: MoveClassification;
  size?: "sm" | "md";
}

export function ClassificationBadge({ classification, size = "sm" }: Props) {
  const meta = CLASSIFICATION_META[classification];
  const fontSize = size === "sm" ? "0.65rem" : "0.75rem";
  const padding = size === "sm" ? "2px 6px" : "3px 8px";

  return (
    <span
      className="classification-badge"
      style={{
        background: `${meta.color}22`,
        border: `1px solid ${meta.color}55`,
        color: meta.color,
        borderRadius: "10px",
        padding,
        fontSize,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {meta.icon} {meta.label}
    </span>
  );
}
