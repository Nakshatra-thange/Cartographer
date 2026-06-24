import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { Graph, GraphNode, GraphEdge } from "./types";

interface Props {
  graph: Graph;
  onNodeClick: (node: GraphNode) => void;
  activeCluster: number | null;
}

const CLUSTER_FILLS = [
  "#e8f4e8", // mint
  "#fce8f0", // pink
  "#fef9d7", // yellow
  "#e8eefa", // lavender
  "#fde8d8", // peach
  "#e8f7fa", // sky
  "#f0e8fa", // lilac
  "#e8faf0", // seafoam
];

const CLUSTER_STROKES = [
  "#2d6e2d",
  "#8c3a5a",
  "#8c7a00",
  "#3a5a8c",
  "#8c5a2d",
  "#2d6e8c",
  "#6e2d8c",
  "#2d8c6e",
];

function clusterFill(id: number)   { return CLUSTER_FILLS[id  % CLUSTER_FILLS.length]; }
function clusterStroke(id: number) { return CLUSTER_STROKES[id % CLUSTER_STROKES.length]; }

function nodeRadius(n: GraphNode): number {
  return Math.max(5, Math.min(22, 5 + n.coupling * 1.8));
}
function isDanger(n: GraphNode, maxRisk: number)  { return n.risk_score > 0 && n.risk_score >= maxRisk * 0.4; }
function isStable(n: GraphNode, maxRisk: number)  { return n.coupling >= 3 && n.churn === 0; }
function isOrphan(n: GraphNode)                   { return n.coupling === 0; }

export default function ForceGraph({ graph, onNodeClick, activeCluster }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width  = svgRef.current.clientWidth  || 960;
    const height = svgRef.current.clientHeight || 700;

    d3.select(svgRef.current).selectAll("*").remove();

    const nodes: GraphNode[] = graph.nodes.map((n) => ({ ...n }));
    const edges: GraphEdge[] = graph.edges.map((e) => ({ ...e, source: e.from, target: e.to }));

    const maxRisk = d3.max(nodes, (d) => d.risk_score) ?? 1;

    // ── SVG root ──────────────────────────────────────────────────────────────
    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    // Grid paper background pattern — our signature aesthetic
    const defs = svg.append("defs");

    defs.append("pattern")
      .attr("id", "grid")
      .attr("width", 28).attr("height", 28)
      .attr("patternUnits", "userSpaceOnUse")
      .append("path")
      .attr("d", "M 28 0 L 0 0 0 28")
      .attr("fill", "none")
      .attr("stroke", "rgba(26,26,26,0.07)")
      .attr("stroke-width", 1);

    // Arrow marker for edges
    defs.append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20).attr("refY", 0)
      .attr("markerWidth", 5).attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#1a1a1a")
      .attr("fill-opacity", 0.4);

    defs.append("marker")
      .attr("id", "danger-ring")
      .attr("viewBox", "-10 -10 20 20")
      .attr("markerWidth", 1).attr("markerHeight", 1);

    svg.append("rect")
      .attr("width", width).attr("height", height)
      .attr("fill", "url(#grid)");

    const g = svg.append("g");

    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.08, 5])
        .on("zoom", (e) => g.attr("transform", e.transform))
    );

    const sim = d3.forceSimulation<GraphNode>(nodes)
      .force("link",
        d3.forceLink<GraphNode, GraphEdge>(edges)
          .id((d) => d.id)
          .distance(90)
          .strength(0.25)
      )
      .force("charge", d3.forceManyBody().strength(-220))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<GraphNode>().radius((d) => nodeRadius(d) + 6))
      .force("radial-orphan",
        d3.forceRadial<GraphNode>(
          Math.min(width, height) * 0.42,
          width / 2,
          height / 2
        ).strength((d) => isOrphan(d) ? 0.6 : 0)
      );
    const linkG = g.append("g");

    const link = linkG.selectAll("line")
      .data(edges)
      .join("line")
      .attr("stroke", "#1a1a1a")
      .attr("stroke-opacity", 0.18)
      .attr("stroke-width", 1.2)
      .attr("marker-end", "url(#arrow)");

    const dangerNodes = nodes.filter((d) => isDanger(d, maxRisk));

    const pulseRing = g.append("g")
      .selectAll("circle.pulse")
      .data(dangerNodes)
      .join("circle")
      .attr("class", "pulse")
      .attr("r", (d) => nodeRadius(d) + 6)
      .attr("fill", "none")
      .attr("stroke", "#c0748a")       
      .attr("stroke-width", 2.5)
      .attr("stroke-dasharray", "4 3");

    if (!document.getElementById("carto-pulse-style")) {
      const s = document.createElement("style");
      s.id = "carto-pulse-style";
      s.textContent = `
        @keyframes carto-pulse {
          0%   { opacity: 1;   transform-origin: center; }
          50%  { opacity: 0.4; }
          100% { opacity: 1;   }
        }
        .pulse { animation: carto-pulse 1.8s ease-in-out infinite; }
      `;
      document.head.appendChild(s);
    }
    const stableNodes = nodes.filter((d) => isStable(d, maxRisk) && !isDanger(d, maxRisk));

    g.append("g")
      .selectAll("circle.stable")
      .data(stableNodes)
      .join("circle")
      .attr("class", "stable")
      .attr("r", (d) => nodeRadius(d) + 3.5)
      .attr("fill", "none")
      .attr("stroke", "#1a1a1a")
      .attr("stroke-width", 3);

    const nodeG = g.append("g");

    const node = nodeG.selectAll<SVGCircleElement, GraphNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("r", nodeRadius)
      .attr("fill", (d) => {
        if (isOrphan(d)) return "#f1efe8";   // gray — pushed to periphery
        return clusterFill(d.cluster_id);
      })
      .attr("fill-opacity", (d) => {
        if (isOrphan(d)) return 0.5;
        return 0.55 + Math.min(0.45, d.churn * 0.07);
      })
      .attr("stroke", (d) => {
        if (isOrphan(d))           return "#aaa";
        if (isDanger(d, maxRisk))  return "#c0748a";
        return clusterStroke(d.cluster_id);
      })
      .attr("stroke-width", (d) => isDanger(d, maxRisk) ? 3 : 2)
      .style("cursor", "pointer")
      .on("click", (_e, d) => onNodeClick(d))
      .call(
        d3.drag<SVGCircleElement, GraphNode>()
          .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on("drag",  (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on("end",   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    node.append("title").text((d) =>
      `${d.path}\ncoupling: ${d.coupling}  churn: ${d.churn}  risk: ${d.risk_score}`
    );
    const maxCoupling = d3.max(nodes, (d) => d.coupling) ?? 1;
    const labelCutoff = maxCoupling * 0.45;

    const label = g.append("g")
      .selectAll("text")
      .data(nodes.filter((d) => d.coupling >= labelCutoff && !isOrphan(d)))
      .join("text")
      .text((d) => d.path.split("/").pop() ?? d.path)
      .attr("font-size", 10)
      .attr("font-family", "'DM Sans', sans-serif")
      .attr("font-weight", "700")
      .attr("fill", "#1a1a1a")
      .attr("pointer-events", "none")
      .attr("dx", (d) => nodeRadius(d) + 5)
      .attr("dy", 4);

    sim.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as GraphNode).y ?? 0);

      node
        .attr("cx", (d) => d.x ?? 0)
        .attr("cy", (d) => d.y ?? 0);

      pulseRing
        .attr("cx", (d) => d.x ?? 0)
        .attr("cy", (d) => d.y ?? 0);

      g.selectAll("circle.stable")
        .attr("cx", (d: any) => d.x ?? 0)
        .attr("cy", (d: any) => d.y ?? 0);

      label
        .attr("x", (d) => d.x ?? 0)
        .attr("y", (d) => d.y ?? 0);
    });

    sim.on("end", () => sim.stop());
    return () => { sim.stop(); };

  }, [graph, activeCluster]);

  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll<SVGCircleElement, GraphNode>("circle[fill]")
      .attr("opacity", (d) => {
        if (activeCluster === null) return 1;
        return d.cluster_id === activeCluster ? 1 : 0.12;
      });
  }, [activeCluster]);

  return (
    <svg
      ref={svgRef}
      style={{ width: "100%", height: "100%", background: "#faf9f6" }}
    />
  );
}