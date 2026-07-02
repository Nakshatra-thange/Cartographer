import { useState, useEffect } from "react";

const API = "http://localhost:3001";

export interface ClusterLabel {
  cluster_id: number;
  label:      string;
  summary:    string;
}

export function useClusterLabels(repo: string | null): Map<number, ClusterLabel> {
  const [labels, setLabels] = useState<Map<number, ClusterLabel>>(new Map());

  useEffect(() => {
    if (!repo) { setLabels(new Map()); return; }

    fetch(`${API}/api/labels?repo=${encodeURIComponent(repo)}`)
      .then((r) => r.json())
      .then((data: ClusterLabel[]) => {
        if (Array.isArray(data)) {
          setLabels(new Map(data.map((l) => [l.cluster_id, l])));
        }
      })
      .catch(() => { /* labels failing is non-fatal */ });
  }, [repo]);

  return labels;
}