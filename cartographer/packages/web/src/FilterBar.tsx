import type { FilterControls } from "./useFilter";
import type { Graph } from "./types";
import { useMemo } from "react";

interface Props {
  controls: FilterControls;
  graph: Graph;
  matchCount: number;
}

const LANG_COLORS: Record<string, string> = {
  typescript:  "#e8eefa",
  javascript:  "#fef9d7",
  python:      "#e8f4e8",
  rust:        "#fde8d8",
  go:          "#e8f7fa",
  ruby:        "#fce8f0",
  java:        "#f0e8fa",
  cpp:         "#fce8f0",
};

const LANG_STROKES: Record<string, string> = {
  typescript:  "#3a5a8c",
  javascript:  "#8c7a00",
  python:      "#2d6e2d",
  rust:        "#8c5a2d",
  go:          "#2d6e8c",
  ruby:        "#8c3a5a",
  java:        "#6e2d8c",
  cpp:         "#8c3a5a",
};

function langFill(l: string)   { return LANG_COLORS[l]  ?? "#f1efe8"; }
function langStroke(l: string) { return LANG_STROKES[l] ?? "#aaa"; }

function SliderRow({ label, min, max, value, onChange }: {
  label: string; min: number; max: number; value: number; onChange: (n: number) => void;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#aaa" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a", fontFamily: "'Playfair Display', serif" }}>{value}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value} step={1}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#1a1a1a", cursor: "pointer" }}
      />
    </div>
  );
}

export default function FilterBar({ controls, graph, matchCount }: Props) {
  const { filters } = controls;

  const maxChurn    = useMemo(() => Math.max(...graph.nodes.map((n) => n.churn), 1),    [graph]);
  const maxCoupling = useMemo(() => Math.max(...graph.nodes.map((n) => n.coupling), 1), [graph]);
  const langs       = useMemo(() => [...new Set(graph.nodes.map((n) => n.language))].filter((l) => l !== "unknown").sort(), [graph]);

  const isFiltered = filters.query || filters.minChurn > 0 || filters.maxChurn < maxChurn || filters.minCoupling > 0 || filters.maxCoupling < maxCoupling || filters.languages.size > 0;

  return (
    <div style={{ borderBottom: "2.5px solid #1a1a1a", background: "#faf9f6", flexShrink: 0 }}>

      {/* ── Search row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1.5px solid #e5e0d8" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 0, border: "2px solid #1a1a1a", borderRadius: 999, background: "white", overflow: "hidden" }}>
          <span style={{ padding: "0 10px", fontSize: 14, color: "#aaa" }}>⌕</span>
          <input
            value={filters.query}
            onChange={(e) => controls.setQuery(e.target.value)}
            placeholder="Search files... (e.g. router, auth)"
            style={{ flex: 1, border: "none", outline: "none", padding: "7px 4px 7px 0", fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: "transparent", color: "#1a1a1a" }}
          />
          {filters.query && (
            <button onClick={() => controls.setQuery("")} style={{ background: "none", border: "none", padding: "0 10px", cursor: "pointer", color: "#aaa", fontSize: 16 }}>✕</button>
          )}
        </div>

        {/* Match count pill */}
        <span style={{ fontSize: 11, fontWeight: 700, background: "#fef9d7", border: "2px solid #8c7a00", borderRadius: 999, padding: "4px 12px", color: "#8c7a00", whiteSpace: "nowrap" }}>
          {matchCount} / {graph.node_count}
        </span>

        {isFiltered && (
          <button
            onClick={controls.reset}
            style={{ fontSize: 11, fontWeight: 700, background: "none", border: "2px solid #ccc", borderRadius: 999, padding: "4px 12px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#888", whiteSpace: "nowrap" }}
          >
            Reset
          </button>
        )}
      </div>

      {/* ── Sliders + language filters ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>

        {/* Churn slider */}
        <div style={{ padding: "12px 16px", borderRight: "1.5px solid #e5e0d8" }}>
          <SliderRow label="Min churn"    min={0} max={maxChurn}    value={filters.minChurn}    onChange={controls.setMinChurn} />
          <SliderRow label="Max churn"    min={0} max={maxChurn}    value={filters.maxChurn}    onChange={controls.setMaxChurn} />
        </div>

        {/* Coupling slider */}
        <div style={{ padding: "12px 16px", borderRight: "1.5px solid #e5e0d8" }}>
          <SliderRow label="Min coupling" min={0} max={maxCoupling} value={filters.minCoupling} onChange={controls.setMinCoupling} />
          <SliderRow label="Max coupling" min={0} max={maxCoupling} value={filters.maxCoupling} onChange={controls.setMaxCoupling} />
        </div>

        {/* Language filter */}
        <div style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#aaa", marginBottom: 8 }}>Language</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {langs.map((lang) => {
              const active = filters.languages.has(lang);
              return (
                <button
                  key={lang}
                  onClick={() => controls.toggleLanguage(lang)}
                  style={{
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: active ? langFill(lang)  : "white",
                    border:     `2px solid ${active ? langStroke(lang) : "#ddd"}`,
                    borderRadius: 999, padding: "3px 10px",
                    fontFamily: "'DM Sans', sans-serif", color: "#1a1a1a",
                    transition: "border-color .1s, background .1s",
                  }}
                >
                  {lang}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
