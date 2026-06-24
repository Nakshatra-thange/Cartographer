import { useState } from "react";
import { useGraph } from "./useGraph";
import ForceGraph from "./ForceGraph";
import type { GraphNode } from "./types";

export default function App() {
  const [input, setInput]     = useState("");
  const [repo, setRepo]       = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  const state = useGraph(repo);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (input.trim()) setRepo(input.trim());
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0d0d0d", color: "#eee", fontFamily: "monospace" }}>

      {/* ── Header ── */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #222", display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontWeight: "bold", fontSize: 16, color: "#4f8ef7" }}>Cartographer</span>
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, flex: 1 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://github.com/expressjs/express"
            style={{ flex: 1, background: "#1a1a1a", border: "1px solid #333", color: "#eee", padding: "6px 10px", borderRadius: 4, fontFamily: "monospace" }}
          />
          <button
            type="submit"
            style={{ background: "#4f8ef7", color: "#fff", border: "none", padding: "6px 16px", borderRadius: 4, cursor: "pointer" }}
          >
            Map
          </button>
        </form>
        {state.status === "done" && (
          <span style={{ fontSize: 12, color: "#888" }}>
            {state.graph.node_count} nodes · {state.graph.edge_count} edges
          </span>
        )}
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Graph canvas */}
        <div style={{ flex: 1, position: "relative" }}>
          {state.status === "idle" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#444" }}>
              Enter a GitHub repo URL above
            </div>
          )}
          {state.status === "loading" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#888" }}>
              Cloning · Parsing · Embedding · Clustering…
            </div>
          )}
          {state.status === "error" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#f74f6e" }}>
              {state.message}
            </div>
          )}
          {state.status === "done" && (
            <ForceGraph
              graph={state.graph}
              onNodeClick={setSelected}
            />
          )}
        </div>

        {/* ── Node detail panel ── */}
        {selected && (
          <div style={{ width: 300, borderLeft: "1px solid #222", padding: 20, overflowY: "auto", fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ color: "#4f8ef7", fontWeight: "bold" }}>File detail</span>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer" }}>✕</button>
            </div>

            <Row label="Path"      value={selected.path} />
            <Row label="Language"  value={selected.language} />
            <Row label="Cluster"   value={selected.cluster_label} />
            <Row label="Coupling"  value={String(selected.coupling)} />
            <Row label="In-degree"  value={String(selected.in_degree)} />
            <Row label="Out-degree" value={String(selected.out_degree)} />
            <Row label="Churn"     value={String(selected.churn)} />
            <Row label="Authors"   value={String(selected.authors)} />
            <Row label="Risk score" value={String(selected.risk_score)} />
            <Row label="Size"      value={`${(selected.size_bytes / 1024).toFixed(1)} KB`} />
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      {state.status === "done" && (
        <div style={{ padding: "8px 20px", borderTop: "1px solid #222", display: "flex", gap: 24, fontSize: 11, color: "#666" }}>
          <span>● Size = coupling</span>
          <span>● Color = cluster</span>
          <span>● Opacity = churn</span>
          <span style={{ color: "#f74f4f" }}>● Red ring = danger zone</span>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: "#666", fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div style={{ color: "#ddd", wordBreak: "break-all" }}>{value}</div>
    </div>
  );
}