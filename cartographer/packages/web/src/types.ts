export interface GraphNode {
    id: string;
    path: string;
    language: string;
    size_bytes: number;
    churn: number;
    authors: number;
    in_degree: number;
    out_degree: number;
    coupling: number;
    risk_score: number;
    cluster_id: number;
    cluster_label: string;
    // Added by D3 during simulation
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
  }
  
  export interface GraphEdge {
    from: string;
    to: string;
    import_type: string;
    // D3 replaces these strings with object references during simulation
    source?: GraphNode | string;
    target?: GraphNode | string;
  }
  
  export interface Graph {
    repo: string;
    generated_at: number;
    history_days: number;
    node_count: number;
    edge_count: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
  }