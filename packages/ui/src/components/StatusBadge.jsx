export default function StatusBadge({ engine }) {
    if (!engine) return null;
    return (
      <span style={{
        fontSize: 10, padding: "3px 8px", borderRadius: 4,
        background: engine === "cloud" ? "rgba(77,184,255,0.1)" : "rgba(168,85,247,0.1)",
        color: engine === "cloud" ? "#4db8ff" : "#a855f7",
        border: `1px solid ${engine === "cloud" ? "rgba(77,184,255,0.25)" : "rgba(168,85,247,0.25)"}`,
        fontFamily: "'JetBrains Mono',monospace"
      }}>
        {engine === "cloud" ? "☁️ Cloud" : "🖥️ Local"}
      </span>
    );
  }
