import { STANDARDS } from "@codescan/core";

export default function StandardsPicker({ selected, onChange }) {
  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);

  return (
    <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: 8, padding: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {STANDARDS.map(s => {
          const on = selected.includes(s.id);
          return (
            <span key={s.id} onClick={() => toggle(s.id)} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: 20, cursor: "pointer",
              fontSize: 11, transition: "all 0.12s", userSelect: "none",
              border: "1px solid",
              borderColor: on ? "rgba(77,184,255,0.35)" : "rgba(255,255,255,0.08)",
              background: on ? "rgba(77,184,255,0.12)" : "rgba(255,255,255,0.04)",
              color: on ? "#4db8ff" : "#555",
            }}>
              {s.icon} {s.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}