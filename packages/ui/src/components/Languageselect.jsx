import { LANGUAGE_LABELS } from "@codescan/core";

export default function LanguageSelect({ value, onChange }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: "#111118", border: "1px solid #1e1e2e", color: "#e2e8f0",
      padding: "9px 12px", borderRadius: 6,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 13, outline: "none", cursor: "pointer"
    }}>
      {LANGUAGE_LABELS.map(l => <option key={l}>{l}</option>)}
    </select>
  );
}