import { useMemo, useState } from "react";
import type { Graph } from "./types";

export interface FilterState {
  query: string;
  minChurn: number;
  maxChurn: number;
  minCoupling: number;
  maxCoupling: number;
  languages: Set<string>;
}

export interface FilterControls {
  filters: FilterState;
  setQuery:      (q: string) => void;
  setMinChurn:   (n: number) => void;
  setMaxChurn:   (n: number) => void;
  setMinCoupling:(n: number) => void;
  setMaxCoupling:(n: number) => void;
  toggleLanguage:(lang: string) => void;
  reset:         () => void;
}

export function useFilter(graph: Graph | null): {
  controls: FilterControls;
  matchedIds: Set<string>;
  highlightedIds: Set<string>;
} {
  const bounds = useMemo(() => {
    if (!graph) return { maxChurn: 10, maxCoupling: 10, langs: [] as string[] };
    const maxChurn    = Math.max(...graph.nodes.map((n) => n.churn), 1);
    const maxCoupling = Math.max(...graph.nodes.map((n) => n.coupling), 1);
    const langs       = [...new Set(graph.nodes.map((n) => n.language))].filter((l) => l !== "unknown").sort();
    return { maxChurn, maxCoupling, langs };
  }, [graph]);

  const [filters, setFilters] = useState<FilterState>({
    query: "",
    minChurn: 0,
    maxChurn: bounds.maxChurn,
    minCoupling: 0,
    maxCoupling: bounds.maxCoupling,
    languages: new Set(),
  });

  // Reset bounds when graph changes
  useMemo(() => {
    setFilters((f) => ({
      ...f,
      maxChurn: bounds.maxChurn,
      maxCoupling: bounds.maxCoupling,
      languages: new Set(),
    }));
  }, [bounds]);

  const controls: FilterControls = {
    filters,
    setQuery:       (q)    => setFilters((f) => ({ ...f, query: q })),
    setMinChurn:    (n)    => setFilters((f) => ({ ...f, minChurn: n })),
    setMaxChurn:    (n)    => setFilters((f) => ({ ...f, maxChurn: n })),
    setMinCoupling: (n)    => setFilters((f) => ({ ...f, minCoupling: n })),
    setMaxCoupling: (n)    => setFilters((f) => ({ ...f, maxCoupling: n })),
    toggleLanguage: (lang) => setFilters((f) => {
      const next = new Set(f.languages);
      next.has(lang) ? next.delete(lang) : next.add(lang);
      return { ...f, languages: next };
    }),
    reset: () => setFilters({
      query: "",
      minChurn: 0,
      maxChurn: bounds.maxChurn,
      minCoupling: 0,
      maxCoupling: bounds.maxCoupling,
      languages: new Set(),
    }),
  };

  // Fuzzy path match — simple substring, case-insensitive, good enough
  function fuzzyMatch(path: string, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    const p = path.toLowerCase();
    // Allow partial matches across path segments: "ro/in" matches "router/index"
    let qi = 0;
    for (let pi = 0; pi < p.length && qi < q.length; pi++) {
      if (p[pi] === q[qi]) qi++;
    }
    return qi === q.length;
  }

  const matchedIds = useMemo<Set<string>>(() => {
    if (!graph) return new Set();
    return new Set(
      graph.nodes
        .filter((n) =>
          fuzzyMatch(n.path, filters.query) &&
          n.churn    >= filters.minChurn    &&
          n.churn    <= filters.maxChurn    &&
          n.coupling >= filters.minCoupling &&
          n.coupling <= filters.maxCoupling &&
          (filters.languages.size === 0 || filters.languages.has(n.language))
        )
        .map((n) => n.id)
    );
  }, [graph, filters]);

  // Highlighted = query match specifically (for the search pulse effect)
  const highlightedIds = useMemo<Set<string>>(() => {
    if (!graph || !filters.query) return new Set();
    return new Set(
      graph.nodes.filter((n) => fuzzyMatch(n.path, filters.query)).map((n) => n.id)
    );
  }, [graph, filters.query]);

  return { controls, matchedIds, highlightedIds };
}
