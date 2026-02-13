"use client";

export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            background: "#191918",
            color: "#ecebe8",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              borderRadius: "20px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              padding: "3rem 2.5rem",
              maxWidth: "460px",
              width: "100%",
            }}
          >
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>💥</div>
            <h1
              style={{
                fontSize: "4rem",
                fontWeight: 800,
                margin: "0 0 0.5rem",
                background: "linear-gradient(135deg, #d97757, #e8956f)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Error
            </h1>
            <h2
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                margin: "0 0 1rem",
                color: "#ecebe8",
              }}
            >
              Critical Error
            </h2>
            <p
              style={{
                color: "#9e9d99",
                marginBottom: "2rem",
                lineHeight: 1.6,
              }}
            >
              9Router encountered a critical error that prevented the page from
              rendering. Please try again or contact support.
            </p>
            <button
              onClick={reset}
              style={{
                background: "#d97757",
                color: "white",
                border: "none",
                borderRadius: "10px",
                padding: "0.75rem 2rem",
                fontSize: "1rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseOver={(e) => (e.target.style.background = "#c56243")}
              onMouseOut={(e) => (e.target.style.background = "#d97757")}
            >
              ↻ Retry
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
