"use client";

import { useEffect } from "react";

// global-error remplace entièrement le layout racine : aucun provider
// (thème, i18n) n'est disponible ici. On reste donc volontairement minimal
// et autonome. Ne se déclenche que pour les erreurs catastrophiques.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
          Something went wrong
        </h1>
        <p style={{ maxWidth: "28rem", color: "#6b7280" }}>
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={() => reset()}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            border: "1px solid #d1d5db",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
