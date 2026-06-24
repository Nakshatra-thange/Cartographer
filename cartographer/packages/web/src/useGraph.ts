import { useState, useEffect } from "react";
import type { Graph } from "./types";

const API = "http://localhost:3001";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; graph: Graph };

export function useGraph(repo: string | null) {
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    if (!repo) { setState({ status: "idle" }); return; }

    setState({ status: "loading" });

    const url = `${API}/api/graph?repo=${encodeURIComponent(repo)}`;

    fetch(url)
      .then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(e.error));
        return r.json();
      })
      .then((graph: Graph) => setState({ status: "done", graph }))
      .catch((e) => setState({ status: "error", message: String(e) }));
  }, [repo]);

  return state;
}