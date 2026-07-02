import { useMemo } from "react";

interface Props {
  commitDays: number[];   // raw unix day buckets
  width?: number;
  height?: number;
  color?: string;
}

// Bucket commits into N weekly bins and draw a tiny bar chart
export default function Sparkline({ commitDays, width = 200, height = 36, color = "#2d6e2d" }: Props) {
  const bars = useMemo(() => {
    if (commitDays.length === 0) return [];

    const now   = Math.floor(Date.now() / 86400000);
    const WEEKS = 13; // 13 weeks = 91 days
    const bins  = new Array(WEEKS).fill(0);

    for (const day of commitDays) {
      const weeksAgo = Math.floor((now - day) / 7);
      if (weeksAgo >= 0 && weeksAgo < WEEKS) {
        bins[WEEKS - 1 - weeksAgo]++;
      }
    }

    return bins;
  }, [commitDays]);

  if (bars.length === 0 || bars.every((b) => b === 0)) {
    return (
      <div style={{ fontSize: 11, color: "#bbb", fontStyle: "italic", padding: "8px 0" }}>
        No commits in last 90 days
      </div>
    );
  }

  const max   = Math.max(...bars, 1);
  const gap   = 2;
  const barW  = (width - gap * (bars.length - 1)) / bars.length;

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      {bars.map((count, i) => {
        const barH = Math.max(2, (count / max) * (height - 4));
        const x    = i * (barW + gap);
        const y    = height - barH;
        return (
          <g key={i}>
            <rect
              x={x} y={y}
              width={barW} height={barH}
              fill={count > 0 ? color : "#e8e4dc"}
              rx={1}
            />
            {count > 0 && (
              <title>{`${count} commit${count > 1 ? "s" : ""}`}</title>
            )}
          </g>
        );
      })}
    </svg>
  );
}