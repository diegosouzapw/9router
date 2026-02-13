"use client";

import { useEffect, useState } from "react";

export default function Error({ error, reset }) {
  const [errorId] = useState(() => Math.random().toString(36).slice(2, 8));

  useEffect(() => {
    console.error("[9router] Application error:", error);
  }, [error]);

  return (
    <div className="error-page">
      <div className="error-container">
        {/* Decorative background orbs */}
        <div className="error-orb error-orb-1" />
        <div className="error-orb error-orb-2" />

        <div className="error-content">
          <span className="error-icon">⚠️</span>
          <h1 className="error-code">500</h1>
          <h2 className="error-title">Something went wrong</h2>
          <p className="error-description">
            {error?.message || "An unexpected error occurred."}
          </p>
          <p className="error-detail">Error ID: {errorId}</p>
          <div className="error-actions">
            <button onClick={reset} className="error-button-primary">
              ↻ Try Again
            </button>
            <a href="/dashboard" className="error-button-secondary">
              ← Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
