import { useState, useEffect, useRef } from "react";

const API = "http://localhost:3001";

export type ProgressStep = "idle" | "cloning" | "parsing" | "embedding" | "clustering" | "done" | "error";

export interface ProgressState {
  step: ProgressStep;
  message: string;
  percent: number;
}

export function useProgress(repo: string | null): ProgressState {
  const [state, setState] = useState<ProgressState>({
    step: "idle", message: "", percent: 0,
  });
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!repo) {
      setState({ step: "idle", message: "", percent: 0 });
      return;
    }

    // Clean up previous stream
    esRef.current?.close();

    setState({ step: "cloning", message: "Connecting...", percent: 0 });

    const es = new EventSource(`${API}/api/progress?repo=${encodeURIComponent(repo)}`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        setState({
          step:    event.step    ?? "cloning",
          message: event.message ?? "",
          percent: event.percent ?? 0,
        });
      } catch { /* malformed event */ }
    };

    es.onerror = () => {
      // SSE connection error usually means the build finished and the server closed the stream
      // Don't treat this as a fatal error — useGraph will surface real errors
      es.close();
    };

    return () => { es.close(); };
  }, [repo]);

  return state;
}