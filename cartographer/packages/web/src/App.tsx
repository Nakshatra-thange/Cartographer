import { useState, useMemo } from "react";
import { useGraph } from "./useGraph";
import ForceGraph from "./ForceGraph";
import type { GraphNode, Graph } from "./types";

// ── Cluster panel helpers ─────────────────────────────────────────────────────

const CLUSTER_FILLS = [
  "#e8f4e8","#fce8f0","#fef9d7","#e8eefa",
  "#fde8d8","#e8f7fa","#f0e8fa","#e8faf0",
];
const CLUSTER_STROKES = [
  "#2d6e2d","#8c3a5a","#8c7a00","#3a5a8c",
  "#8c5a2d","#2d6e8c","#6e2d8c","#2d8c6e",
];

function clusterFill(id: number)   { return CLUSTER_FILLS[id   % CLUSTER_FILLS.length]; }
function clusterStroke(id: number) { return CLUSTER_STROKES[id % CLUSTER_STROKES.length]; }

interface ClusterSummary {
  id: number;
  label: string;
  count: number;
  topFile: string;
  maxRisk: number;
}

function summariseClusters(graph: Graph): ClusterSummary[] {
  const map = new Map<number, GraphNode[]>();
  for (const n of graph.nodes) {
    (map.get(n.cluster_id) ?? map.set(n.cluster_id, []).get(n.cluster_id)!).push(n);
  }
  return Array.from(map.entries())
    .map(([id, nodes]) => ({
      id,
      label: nodes[0].cluster_label ?? `Cluster ${id}`,
      count: nodes.length,
      topFile: nodes.sort((a, b) => b.coupling - a.coupling)[0].path.split("/").pop() ?? "",
      maxRisk: Math.max(...nodes.map((n) => n.risk_score)),
    }))
    .sort((a, b) => a.id - b.id);
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [input, setInput]           = useState("");
  const [repo, setRepo]             = useState<string | null>(null);
  const [selected, setSelected]     = useState<GraphNode | null>(null);
  const [activeCluster, setActive]  = useState<number | null>(null);

  const state = useGraph(repo);
  const clusters = useMemo(
    () => state.status === "done" ? summariseClusters(state.graph) : [],
    [state]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input.trim()) { setRepo(input.trim()); setSelected(null); setActive(null); }
  }

  function toggleCluster(id: number) {
    setActive((prev) => prev === id ? null : id);
    setSelected(null);
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh",
      fontFamily: "'DM Sans', sans-serif",
      backgroundImage: "linear-gradient(rgba(0,0,0,0.055) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.055) 1px,transparent 1px)",
      backgroundSize: "28px 28px", backgroundColor: "#faf9f6", color: "#1a1a1a",
    }}>

      {/* ── Nav ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", borderBottom: "2.5px solid #1a1a1a", background: "#faf9f6", zIndex: 10 }}>
        <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: 24, letterSpacing: -1 }}>carto.</span>

        <form onSubmit={handleSubmit} style={{ display: "flex", flex: 1, maxWidth: 520, margin: "0 32px", alignItems: "center", border: "2.5px solid #1a1a1a", borderRadius: 999, background: "white", overflow: "hidden" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="github.com/expressjs/express"
            style={{ flex: 1, border: "none", outline: "none", padding: "10px 18px", fontSize: 14, fontFamily: "'DM Sans', sans-serif", background: "transparent", color: "#1a1a1a" }}
          />
          <button type="submit" style={{ margin: 3, background: "#1a1a1a", color: "#faf9f6", border: "none", borderRadius: 999, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Map it →
          </button>
        </form>

        {state.status === "done" && (
          <span style={{ fontSize: 12, color: "#888", fontWeight: 600, whiteSpace: "nowrap" }}>
            {state.graph.node_count} nodes · {state.graph.edge_count} edges
          </span>
        )}
      </div>

      {/* ── Ticker ── */}
      <div style={{ background: "#b8d4b0", borderBottom: "2.5px solid #1a1a1a", overflow: "hidden", padding: "8px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 40, width: "max-content", animation: "ticker 22s linear infinite", fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" }}>
          {["Coupling analysis","·","Churn detection","·","Semantic clustering","·","Danger zones","·","Git history","·","Static call graph","·","Coupling analysis","·","Churn detection","·","Semantic clustering","·","Danger zones","·","Git history","·","Static call graph","·"].map((t, i) => <span key={i}>{t}</span>)}
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── Cluster sidebar — left ── */}
        {state.status === "done" && (
          <div style={{ width: 220, borderRight: "2.5px solid #1a1a1a", background: "#faf9f6", overflowY: "auto", flexShrink: 0 }}>

            <div style={{ padding: "14px 16px 10px", borderBottom: "1.5px solid #e5e0d8" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#aaa", marginBottom: 4 }}>Clusters</div>
              {activeCluster !== null && (
                <button
                  onClick={() => setActive(null)}
                  style={{ fontSize: 11, fontWeight: 700, color: "#888", background: "none", border: "1.5px solid #ccc", borderRadius: 999, padding: "3px 10px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                >
                  Show all
                </button>
              )}
            </div>

            <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
              {clusters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleCluster(c.id)}
                  style={{
                    width: "100%", textAlign: "left", cursor: "pointer",
                    background: activeCluster === c.id ? clusterFill(c.id) : "white",
                    border: `2.5px solid ${activeCluster === c.id ? clusterStroke(c.id) : "#e5e0d8"}`,
                    borderRadius: 12, padding: "10px 12px",
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "border-color .12s, background .12s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: clusterFill(c.id), border: `2px solid ${clusterStroke(c.id)}`, flexShrink: 0, display: "inline-block" }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>{c.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#888", paddingLeft: 18 }}>{c.count} files</div>
                  {c.maxRisk > 2 && (
                    <div style={{ marginTop: 5, paddingLeft: 18 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: "#fce8f0", border: "1.5px solid #c0748a", borderRadius: 999, padding: "2px 8px", color: "#8c3a5a" }}>
                        ⚠ risk {c.maxRisk}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>

          </div>
        )}

        {/* ── Graph canvas ── */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

          {state.status === "idle" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 42, fontWeight: 900, color: "#1a1a1a", textAlign: "center", lineHeight: 1.1 }}>
                your codebase,<br />
                <span style={{ background: "#fde68a", padding: "0 8px" }}>as a living map.</span>
              </div>
              <p style={{ color: "#888", fontSize: 14, marginTop: 8 }}>Paste a GitHub URL above to begin.</p>
            </div>
          )}

          {state.status === "loading" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 900 }}>Mapping...</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                {["Cloning", "Parsing", "Embedding", "Clustering"].map((s, i) => (
                  <span key={i} style={{ background: i === 0 ? "#b8d4b0" : "#f0ede8", border: "2px solid #1a1a1a", borderRadius: 999, padding: "5px 14px", fontSize: 12, fontWeight: 700 }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {state.status === "error" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: "#fce8f0", border: "2.5px solid #1a1a1a", borderRadius: 16, padding: "24px 32px", fontSize: 14, fontWeight: 600 }}>
                ⚠ {state.message}
              </div>
            </div>
          )}

          {state.status === "done" && (
            <ForceGraph
              graph={state.graph}
              onNodeClick={setSelected}
              activeCluster={activeCluster}
            />
          )}

          {/* Active cluster label overlay */}
          {state.status === "done" && activeCluster !== null && (
            <div style={{
              position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
              background: clusterFill(activeCluster),
              border: `2.5px solid ${clusterStroke(activeCluster)}`,
              borderRadius: 999, padding: "6px 18px",
              fontSize: 12, fontWeight: 700, color: "#1a1a1a",
              pointerEvents: "none",
            }}>
              Showing {clusters.find((c) => c.id === activeCluster)?.label} — {clusters.find((c) => c.id === activeCluster)?.count} files
            </div>
          )}
        </div>

        {/* ── Node detail panel — right ── */}
        {selected && (
          <div style={{ width: 260, borderLeft: "2.5px solid #1a1a1a", background: "#faf9f6", overflowY: "auto", flexShrink: 0 }}>
            <div style={{ padding: "14px 18px", borderBottom: "2px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: 15 }}>File detail</span>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#888" }}>✕</button>
            </div>

            {selected.risk_score > 2 && (
              <div style={{ margin: "14px 16px 0" }}>
                <span style={{ fontSize: 11, fontWeight: 700, background: "#fce8f0", border: "2px solid #c0748a", borderRadius: 999, padding: "4px 12px", color: "#8c3a5a" }}>
                  ⚠ Danger zone · risk {selected.risk_score}
                </span>
              </div>
            )}

            {selected.churn === 0 && selected.coupling >= 3 && (
              <div style={{ margin: "14px 16px 0" }}>
                <span style={{ fontSize: 11, fontWeight: 700, background: "#e8f4e8", border: "2px solid #2d6e2d", borderRadius: 999, padding: "4px 12px", color: "#2d6e2d" }}>
                  Stable core
                </span>
              </div>
            )}

            {selected.coupling === 0 && (
              <div style={{ margin: "14px 16px 0" }}>
                <span style={{ fontSize: 11, fontWeight: 700, background: "#f1efe8", border: "2px solid #aaa", borderRadius: 999, padding: "4px 12px", color: "#666" }}>
                  Orphan — no connections
                </span>
              </div>
            )}

            <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
              {([
                ["Path",        selected.path],
                ["Language",    selected.language],
                ["Cluster",     selected.cluster_label],
                ["Coupling",    String(selected.coupling)],
                ["In-degree",   String(selected.in_degree)],
                ["Out-degree",  String(selected.out_degree)],
                ["Churn",       String(selected.churn)],
                ["Authors",     String(selected.authors)],
                ["Risk score",  String(selected.risk_score)],
                ["Size",        `${(selected.size_bytes / 1024).toFixed(1)} KB`],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#aaa", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, color: "#1a1a1a", wordBreak: "break-all", fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      {state.status === "done" && (
        <div style={{ padding: "10px 28px", borderTop: "2.5px solid #1a1a1a", background: "#faf9f6", display: "flex", gap: 28, fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#888", flexShrink: 0 }}>
          <span>● Size = coupling</span>
          <span>● Color = cluster</span>
          <span>● Opacity = churn</span>
          <span style={{ color: "#c0748a" }}>● Pink pulse = danger</span>
          <span style={{ color: "#2d6e2d" }}>● Dark ring = stable core</span>
          <span style={{ color: "#aaa" }}>● Gray = orphan</span>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #faf9f6; }
        ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }
      `}</style>
    </div>
  );
}