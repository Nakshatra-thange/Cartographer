import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { Graph, GraphNode, GraphEdge } from "./types";

interface Props {
  graph: Graph;
  onNodeClick: (node: GraphNode) => void;
}

// ── Colour by cluster ─────────────────────────────────────────────────────────

const CLUSTER_COLORS = [
  "#4f8ef7", "#f7934f", "#4ff7a0", "#f74f6e",
  "#c44ff7", "#f7e94f", "#4ff7f0", "#f7574f",
  "#82f74f", "#f74fb5",
];

function clusterColor(id: number): string {
  return CLUSTER_COLORS[id % CLUSTER_COLORS.length];
}

// ── Node radius: sized by coupling ────────────────────────────────────────────

function nodeRadius(node: GraphNode): number {
  return Math.max(4, Math.min(20, 4 + node.coupling * 1.5));
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ForceGraph({ graph, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width  = svgRef.current.clientWidth  || 900;
    const height = svgRef.current.clientHeight || 700;

    // Clear previous render
    d3.select(svgRef.current).selectAll("*").remove();

    // Deep-copy nodes and edges so D3 can mutate them
    const nodes: GraphNode[] = graph.nodes.map((n) => ({ ...n }));
    const edges: GraphEdge[] = graph.edges.map((e) => ({
      ...e,
      source: e.from,
      target: e.to,
    }));

    // ── SVG setup ─────────────────────────────────────────────────────────────

    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    // Arrow marker for directed edges
    svg.append("defs").append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 18)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#555");

    // Container group — zoom/pan applied here
    const g = svg.append("g");

    // Zoom + pan
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => g.attr("transform", event.transform))
    );

    // ── Force simulation ──────────────────────────────────────────────────────

    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        d3.forceLink<GraphNode, GraphEdge>(edges)
          .id((d) => d.id)
          .distance(80)
          .strength(0.3)
      )
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<GraphNode>().radius((d) => nodeRadius(d) + 3));

    // ── Draw edges ────────────────────────────────────────────────────────────

    const link = g
      .append("g")
      .selectAll("line")
      .data(edges)
      .join("line")
      .attr("stroke", "#333")
      .attr("stroke-opacity", 0.35)
      .attr("stroke-width", 1)
      .attr("marker-end", "url(#arrow)");

    // ── Draw nodes ────────────────────────────────────────────────────────────

    const node = g
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", nodeRadius)
      .attr("fill", (d) => clusterColor(d.cluster_id))
      // Churn: high churn = full opacity, no churn = 40% opacity
      .attr("fill-opacity", (d) => 0.4 + Math.min(0.6, d.churn * 0.06))
      .attr("stroke", (d) => d.risk_score > 3 ? "#ff3333" : "#111")
      .attr("stroke-width", (d) => d.risk_score > 3 ? 2.5 : 0.8)
      .style("cursor", "pointer")
      .on("click", (_event, d) => onNodeClick(d))
      .call(
        d3.drag<SVGCircleElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      );

    // Tooltip on hover
    node.append("title").text((d) =>
      `${d.path}\ncoupling: ${d.coupling}  churn: ${d.churn}  risk: ${d.risk_score}`
    );

    // ── Labels for high-coupling nodes only ───────────────────────────────────
    // Labelling everything is unreadable. Only label the top nodes.

    const maxCoupling = d3.max(nodes, (d) => d.coupling) ?? 1;
    const labelThreshold = maxCoupling * 0.5; // top 50% of max coupling

    const label = g
      .append("g")
      .selectAll("text")
      .data(nodes.filter((d) => d.coupling >= labelThreshold))
      .join("text")
      .text((d) => d.path.split("/").pop() ?? d.path) // filename only
      .attr("font-size", 10)
      .attr("fill", "#ccc")
      .attr("pointer-events", "none")
      .attr("dx", (d) => nodeRadius(d) + 3)
      .attr("dy", 4);

    // ── Tick ──────────────────────────────────────────────────────────────────

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as GraphNode).y ?? 0);

      node
        .attr("cx", (d) => d.x ?? 0)
        .attr("cy", (d) => d.y ?? 0);

      label
        .attr("x", (d) => d.x ?? 0)
        .attr("y", (d) => d.y ?? 0);
    });

    // Stop simulation after it cools to save CPU
    simulation.on("end", () => simulation.stop());

    return () => simulation.stop();
  }, [graph]);

  return (
    <svg
      ref={svgRef}
      style={{ width: "100%", height: "100%", background: "#0d0d0d" }}
    />
  );
}