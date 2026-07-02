import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { Graph, GraphNode } from "./types";

interface Props {
  graph: Graph;
  activeCluster: number | null;
}

const FILLS = ["#e8f4e8","#fce8f0","#fef9d7","#e8eefa","#fde8d8","#e8f7fa","#f0e8fa","#e8faf0"];

export default function MiniMap({ graph, activeCluster }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const W = 160, H = 100;
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current).attr("width", W).attr("height", H);

    // Normalise node positions to minimap size
    const nodes = graph.nodes.slice(0, 300); // cap for perf

    const xScale = d3.scaleLinear()
      .domain([0, 1]).range([4, W - 4]);
    const yScale = d3.scaleLinear()
      .domain([0, 1]).range([4, H - 4]);

    // Use cluster_id to distribute into a rough grid for the minimap
    // (actual positions come from D3 sim which we don't have here)
    const clusterCount = Math.max(...nodes.map((n) => n.cluster_id), 0) + 1;
    const cols = Math.ceil(Math.sqrt(clusterCount));

    svg.selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("cx", (d) => {
        const col = d.cluster_id % cols;
        const jitter = (Math.sin(d.id.length * 7) * 0.5 + 0.5) * 0.18;
        return xScale((col + 0.5 + jitter) / cols);
      })
      .attr("cy", (d) => {
        const row = Math.floor(d.cluster_id / cols);
        const jitter = (Math.cos(d.id.length * 13) * 0.5 + 0.5) * 0.18;
        return yScale((row + 0.5 + jitter) / Math.ceil(clusterCount / cols));
      })
      .attr("r", (d) => Math.max(1.5, Math.min(4, 1.5 + d.coupling * 0.3)))
      .attr("fill", (d) => FILLS[d.cluster_id % FILLS.length])
      .attr("stroke", "#1a1a1a")
      .attr("stroke-width", 0.8)
      .attr("opacity", (d) =>
        activeCluster === null ? 0.85 : d.cluster_id === activeCluster ? 1 : 0.15
      );

  }, [graph, activeCluster]);

  return (
    <div style={{
      position: "absolute", bottom: 16, right: 16,
      border: "2.5px solid #1a1a1a", borderRadius: 12,
      background: "#faf9f6", padding: 8, zIndex: 5,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#aaa", marginBottom: 5 }}>
        Overview
      </div>
      <svg ref={svgRef} />
    </div>
  );
}