import { useMemo } from "react";
import type { GraphNode, Graph } from "./types";
import Sparkline from "./Sparkline";

interface Props {
  node: GraphNode;
  graph: Graph;
  onClose: () => void;
}

// Cluster palette — must match ForceGraph and App
const CLUSTER_FILLS   = ["#e8f4e8","#fce8f0","#fef9d7","#e8eefa","#fde8d8","#e8f7fa","#f0e8fa","#e8faf0"];
const CLUSTER_STROKES = ["#2d6e2d","#8c3a5a","#8c7a00","#3a5a8c","#8c5a2d","#2d6e8c","#6e2d8c","#2d8c6e"];
const clusterFill   = (id: number) => CLUSTER_FILLS[id   % CLUSTER_FILLS.length];
const clusterStroke = (id: number) => CLUSTER_STROKES[id % CLUSTER_STROKES.length];

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#aaa", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "#1a1a1a", wordBreak: "break-all", fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}

function FileChip({ path, note }: { path: string; note?: string }) {
  const name = path.split("/").pop() ?? path;
  const dir  = path.includes("/") ? path.split("/").slice(0, -1).join("/") : "";
  return (
    <div style={{ padding: "7px 10px", background: "white", border: "1.5px solid #e5e0d8", borderRadius: 8, marginBottom: 5 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>{name}</div>
      {dir && <div style={{ fontSize: 10, color: "#aaa", marginTop: 1 }}>{dir}</div>}
      {note && <div style={{ fontSize: 10, color: "#c0748a", fontWeight: 700, marginTop: 2 }}>{note}</div>}
    </div>
  );
}

export default function NodePanel({ node, graph, onClose }: Props) {
  // Derive importers (files that import this node) and imports (files this node imports)
  const { importers, imports } = useMemo(() => {
    const importers = graph.edges
      .filter((e) => e.to === node.id)
      .map((e) => e.from)
      .slice(0, 6);

    const imports = graph.edges
      .filter((e) => e.from === node.id)
      .map((e) => e.to)
      .slice(0, 6);

    return { importers, imports };
  }, [node.id, graph.edges]);

  const isDanger = node.risk_score > 2;
  const isStable = node.churn === 0 && node.coupling >= 3;
  const isOrphan = node.coupling === 0;

  // Sparkline color based on risk
  const sparkColor = isDanger ? "#c0748a" : isStable ? "#2d6e2d" : "#3a5a8c";

  return (
    <div style={{ width: 272, borderLeft: "2.5px solid #1a1a1a", background: "#faf9f6", overflowY: "auto", flexShrink: 0, display: "flex", flexDirection: "column" }}>

      {/* ── Header ── */}
      <div style={{ padding: "13px 16px", borderBottom: "2px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: 15 }}>
          File detail
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#888", lineHeight: 1 }}>✕</button>
      </div>

      {/* ── Status badges ── */}
      <div style={{ padding: "12px 14px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
        {isDanger && (
          <span style={{ fontSize: 10, fontWeight: 700, background: "#fce8f0", border: "2px solid #c0748a", borderRadius: 999, padding: "3px 10px", color: "#8c3a5a" }}>
            ⚠ Danger zone
          </span>
        )}
        {isStable && !isDanger && (
          <span style={{ fontSize: 10, fontWeight: 700, background: "#e8f4e8", border: "2px solid #2d6e2d", borderRadius: 999, padding: "3px 10px", color: "#2d6e2d" }}>
            Stable core
          </span>
        )}
        {isOrphan && (
          <span style={{ fontSize: 10, fontWeight: 700, background: "#f1efe8", border: "2px solid #aaa", borderRadius: 999, padding: "3px 10px", color: "#666" }}>
            Orphan
          </span>
        )}
        {/* Cluster badge */}
        <span style={{ fontSize: 10, fontWeight: 700, background: clusterFill(node.cluster_id), border: `2px solid ${clusterStroke(node.cluster_id)}`, borderRadius: 999, padding: "3px 10px", color: "#1a1a1a" }}>
          {node.cluster_label}
        </span>
      </div>

      <div style={{ padding: "14px 14px 0" }}>

        {/* ── Commit sparkline ── */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#aaa", marginBottom: 8 }}>
            Commit activity — last 90 days
          </div>
          <Sparkline
            commitDays={node.commit_days ?? []}
            width={230}
            height={38}
            color={sparkColor}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "#ccc" }}>
            <span>90d ago</span>
            <span>today</span>
          </div>
        </div>

        {/* ── Core metrics ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            ["Coupling", node.coupling],
            ["Risk",     node.risk_score],
            ["Churn",    node.churn],
            ["Authors",  node.authors],
          ].map(([label, val]) => (
            <div key={label as string} style={{ background: "white", border: "1.5px solid #e5e0d8", borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Playfair Display', serif", color: "#1a1a1a", lineHeight: 1.2 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* ── File info ── */}
        <Field label="Path"     value={node.path} />
        <Field label="Language" value={node.language} />
        <Field label="Size"     value={`${(node.size_bytes / 1024).toFixed(1)} KB`} />
        <Field label="In / Out" value={`${node.in_degree} importers · ${node.out_degree} imports`} />

        {/* ── Importers list ── */}
        {importers.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#aaa", marginBottom: 8 }}>
              Imported by ({importers.length})
            </div>
            {importers.map((p) => <FileChip key={p} path={p} />)}
            {node.in_degree > 6 && (
              <div style={{ fontSize: 11, color: "#bbb", padding: "4px 2px" }}>+{node.in_degree - 6} more</div>
            )}
          </div>
        )}

        {/* ── Imports list ── */}
        {imports.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#aaa", marginBottom: 8 }}>
              Imports ({imports.length})
            </div>
            {imports.map((p) => <FileChip key={p} path={p} />)}
            {node.out_degree > 6 && (
              <div style={{ fontSize: 11, color: "#bbb", padding: "4px 2px" }}>+{node.out_degree - 6} more</div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}