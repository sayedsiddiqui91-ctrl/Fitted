import { ImageResponse } from "next/og";

/* Social preview image (WhatsApp, LinkedIn, X, Facebook, Slack…) for every page. */
export const alt = "Fitted — Build a better CV. Tailored to every job.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0b0b0d 0%, #1d1d3a 58%, #3e3eb0 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 40, fontWeight: 700 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "#7c7cf0", color: "#0b0b0d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>F</div>
          Fitted
        </div>
        <div style={{ marginTop: 48, fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>Build a better CV.</div>
        <div style={{ fontSize: 76, fontStyle: "italic", color: "#b8b8ff", lineHeight: 1.1 }}>Tailored to every job.</div>
        <div style={{ marginTop: 40, fontSize: 30, color: "#c9c9d9" }}>Free CV builder · ATS-friendly templates · Honest AI that never invents experience</div>
      </div>
    ),
    { ...size },
  );
}
