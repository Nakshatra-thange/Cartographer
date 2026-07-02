import type { ProgressState } from "./useProgress";

interface Props {
  progress: ProgressState;
}

const STEPS: Array<{ key: string; label: string; percent: number }> = [
  { key: "cloning",    label: "Cloning repo",       percent: 5  },
  { key: "parsing",    label: "Parsing call graph",  percent: 30 },
  { key: "embedding",  label: "Embedding files",     percent: 50 },
  { key: "clustering", label: "Clustering",          percent: 80 },
  { key: "done",       label: "Map ready",           percent: 100},
];

export default function ProgressLoader({ progress }: Props) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 32, padding: 40,
    }}>

      {/* Big Playfair headline */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 38, fontWeight: 900, color: "#1a1a1a", lineHeight: 1.1, marginBottom: 10 }}>
          Mapping your<br />
          <span style={{ background: "#fde68a", padding: "0 8px" }}>codebase.</span>
        </div>
        <div style={{ fontSize: 14, color: "#888", fontWeight: 500 }}>
          {progress.message || "Starting up..."}
        </div>
      </div>

      {/* Progress bar — thick, black-bordered, fills with mint green */}
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ border: "2.5px solid #1a1a1a", borderRadius: 999, overflow: "hidden", height: 18, background: "white" }}>
          <div style={{
            height: "100%",
            width: `${progress.percent}%`,
            background: "#b8d4b0",
            borderRadius: 999,
            transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#aaa", fontWeight: 700 }}>
          <span>0%</span>
          <span style={{ color: "#1a1a1a" }}>{progress.percent}%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Step pills */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {STEPS.map((s) => {
          const isDone    = progress.percent >= s.percent;
          const isActive  = progress.step === s.key;

          return (
            <span key={s.key} style={{
              fontSize: 11, fontWeight: 700,
              padding: "5px 14px", borderRadius: 999,
              border: `2px solid ${isActive ? "#1a1a1a" : isDone ? "#2d6e2d" : "#ddd"}`,
              background: isActive ? "#fde68a" : isDone ? "#e8f4e8" : "white",
              color: isActive ? "#1a1a1a" : isDone ? "#2d6e2d" : "#bbb",
              transition: "all 0.3s",
            }}>
              {isDone && !isActive ? "✓ " : ""}{s.label}
            </span>
          );
        })}
      </div>

    </div>
  );
}