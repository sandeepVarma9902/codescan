/**
 * ScoreRing — circular score display
 * Used in web, desktop, and mobile results screens
 */
import { useState, useEffect } from "react";

export default function ScoreRing({ score, size = 90 }) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    let start = 0;
    const step = Math.ceil(score / 40);
    const timer = setInterval(() => {
      start += step;
      if (start >= score) { setDisplayed(score); clearInterval(timer); }
      else setDisplayed(start);
    }, 20);
    return () => clearInterval(timer);
  }, [score]);

  const color = score >= 80 ? "#4ade80" : score >= 60 ? "#ffb347" : "#ff4d4d";
  const inner = size * 0.78;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle
          cx={size / 2} cy={size / 2} r={size / 2 - 4}
          fill="none" stroke="#1a1a2e" strokeWidth="3"
        />
        <circle
          cx={size / 2} cy={size / 2} r={size / 2 - 4}
          fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${(displayed / 100) * (Math.PI * (size - 8))} ${Math.PI * (size - 8)}`}
          strokeLinecap="round"
          style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dasharray 0.05s" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center"
      }}>
        <div style={{ fontSize: size * 0.25, fontWeight: 800, color, lineHeight: 1 }}>{displayed}</div>
        <div style={{ fontSize: size * 0.1, color: "#444", letterSpacing: "1px" }}>/100</div>
      </div>
    </div>
  );
}
