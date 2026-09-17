import { memo, useMemo } from "react";

const LANE_COLORS = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#ef4444", // red
  "#a855f7", // purple
  "#f97316", // orange
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#eab308", // yellow
];

const NODE_RADIUS = 4;
const LANE_WIDTH = 16;
const ROW_HEIGHT = 28;
const MERGE_CURVE_OFFSET = 6;

interface GraphEntry {
  hash: string;
  lane: number;
  parents: string[];
}

interface CommitGraphProps {
  entries: GraphEntry[];
  maxLane: number;
}

/**
 * SVG commit graph that draws colored lane nodes and merge/fork lines
 * between parent and child commits.
 */
export const CommitGraph = memo(function CommitGraph({
  entries,
  maxLane,
}: CommitGraphProps) {
  // Build index: hash -> row index for parent lookups
  const hashIndex = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((e, i) => map.set(e.hash, i));
    return map;
  }, [entries]);

  const graphWidth = (maxLane + 1) * LANE_WIDTH;

  // Build SVG paths
  const paths = useMemo(() => {
    const result: { d: string; color: string; key: string }[] = [];

    entries.forEach((entry, rowIdx) => {
      const x = entry.lane * LANE_WIDTH + LANE_WIDTH / 2;
      const y = rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

      entry.parents.forEach((parentHash, parentIdx) => {
        const parentRow = hashIndex.get(parentHash);
        if (parentRow === undefined) return;

        const parentEntry = entries[parentRow];
        if (!parentEntry) return;

        const parentX = parentEntry.lane * LANE_WIDTH + LANE_WIDTH / 2;
        const parentY = parentRow * ROW_HEIGHT + ROW_HEIGHT / 2;
        const color = LANE_COLORS[entry.lane % LANE_COLORS.length];

        if (parentIdx === 0) {
          // Direct line (first parent = main line)
          if (parentX === x) {
            // Same lane: straight vertical line
            result.push({
              d: `M${x},${y} L${parentX},${parentY}`,
              color,
              key: `${entry.hash}-${parentHash}`,
            });
          } else {
            // Different lane: curve
            const midY = (y + parentY) / 2;
            result.push({
              d: `M${x},${y} C${x},${midY} ${parentX},${midY} ${parentX},${parentY}`,
              color,
              key: `${entry.hash}-${parentHash}`,
            });
          }
        } else {
          // Merge line (additional parents = merge commits)
          const mergeColor = LANE_COLORS[parentEntry.lane % LANE_COLORS.length];
          const curveDir = parentX > x ? 1 : -1;
          const cpX = x + curveDir * MERGE_CURVE_OFFSET;
          result.push({
            d: `M${x},${y} C${cpX},${y} ${cpX},${parentY} ${parentX},${parentY}`,
            color: mergeColor,
            key: `${entry.hash}-merge-${parentHash}`,
          });
        }
      });
    });

    return result;
  }, [entries, hashIndex]);

  return (
    <svg
      width={graphWidth}
      height={entries.length * ROW_HEIGHT}
      className="shrink-0"
      aria-hidden="true"
    >
      {/* Draw lines first (behind nodes) */}
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke={p.color}
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.7}
        />
      ))}

      {/* Draw nodes */}
      {entries.map((entry, rowIdx) => {
        const x = entry.lane * LANE_WIDTH + LANE_WIDTH / 2;
        const y = rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
        const color = LANE_COLORS[entry.lane % LANE_COLORS.length];
        const isMerge = entry.parents.length > 1;

        return (
          <g key={entry.hash}>
            <circle
              cx={x}
              cy={y}
              r={NODE_RADIUS}
              fill={color}
              stroke={isMerge ? "#fff" : "none"}
              strokeWidth={isMerge ? 1.5 : 0}
            />
            {isMerge && (
              <circle
                cx={x}
                cy={y}
                r={NODE_RADIUS + 2}
                fill="none"
                stroke={color}
                strokeWidth={1}
                opacity={0.4}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
});

export default CommitGraph;
