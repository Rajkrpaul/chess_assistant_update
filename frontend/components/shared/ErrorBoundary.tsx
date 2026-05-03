import React, { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary: ${this.props.label}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            style={{
              padding: "16px",
              color: "#EF4444",
              fontSize: "0.8rem",
              background: "rgba(239,68,68,0.1)",
              borderRadius: "8px",
              border: "1px solid rgba(239,68,68,0.3)",
            }}
          >
            ⚠ {this.props.label ?? "Component"} encountered an error.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
