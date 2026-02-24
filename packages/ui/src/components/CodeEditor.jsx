export default function CodeEditor({ code, onChange, language }) {
    return (
      <div style={{ position: "relative" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: 36,
          background: "#0a0a12", borderRadius: "6px 0 0 6px",
          borderRight: "1px solid #1e1e2e", padding: "16px 0",
          pointerEvents: "none", overflow: "hidden"
        }}>
          {code.split("\n").map((_, i) => (
            <div key={i} style={{
              height: "1.7em", display: "flex", alignItems: "center",
              justifyContent: "flex-end", paddingRight: 8,
              fontSize: 11, color: "#2a2a3a", fontFamily: "'JetBrains Mono',monospace"
            }}>{i + 1}</div>
          ))}
        </div>
        <textarea
          value={code}
          onChange={e => onChange(e.target.value)}
          spellCheck={false}
          placeholder={`// Paste your ${language} code here...`}
          style={{
            width: "100%", background: "#0d0d15", border: "1px solid #1e1e2e",
            color: "#c9d1d9", fontFamily: "'JetBrains Mono',monospace",
            fontSize: 13, lineHeight: 1.7, padding: "16px 16px 16px 48px",
            resize: "vertical", borderRadius: 6, outline: "none", minHeight: 300
          }}
        />
      </div>
    );
  }