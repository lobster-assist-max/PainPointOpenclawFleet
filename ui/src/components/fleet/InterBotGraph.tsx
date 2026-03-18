/**
 * InterBotGraph — Force-directed visualization of bot-to-bot communication.
 *
 * Shows:
 * - Nodes = bots (size = centrality, color = health)
 * - Edges = communication links (thickness = frequency)
 * - Blast radius highlighting when hovering an offline bot
 *
 * Uses SVG for rendering (no d3-force dependency — simplified force layout).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Info, Network, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { fleetCardStyles, impactColors, fleetInfoStyles } from "./design-tokens";

// ─── Types (mirroring server types) ─────────────────────────────────────────

interface GraphNode {
  botId: string;
  name: string;
  emoji: string;
  healthScore: number;
  role: "leader" | "worker" | "specialist" | "autonomous";
  inDegree: number;
  outDegree: number;
  betweenness: number;
}

interface GraphEdge {
  from: string;
  to: string;
  type: "message" | "spawn" | "delegation";
  weight: number;
  lastSeen: string;
  avgLatencyMs: number;
}

interface BlastRadius {
  offlineBot: string;
  affected: Record<string, "critical" | "high" | "medium" | "low">;
  totalImpacted: number;
}

interface InterBotGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  computedAt: string;
}

interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  radius: number;
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface InterBotGraphProps {
  data: InterBotGraphData | null;
  blastRadius?: BlastRadius | null;
  onNodeClick?: (botId: string) => void;
  onNodeHover?: (botId: string | null) => void;
  className?: string;
}

// ─── Health → Color mapping ─────────────────────────────────────────────────

function healthToColor(score: number): string {
  if (score >= 80) return "#27BD74"; // Green
  if (score >= 60) return "#D4A373"; // Gold/warning
  if (score >= 40) return "#E07B39"; // Orange
  return "#DC3545"; // Red
}

function healthToStroke(score: number): string {
  if (score >= 80) return "#1A8A52";
  if (score >= 60) return "#9A7B5B";
  if (score >= 40) return "#B85A1A";
  return "#A91D2A";
}

// ─── Simple force layout ────────────────────────────────────────────────────

function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
): LayoutNode[] {
  if (nodes.length === 0) return [];

  const cx = width / 2;
  const cy = height / 2;

  // Initial positions: circular layout
  const layoutNodes: LayoutNode[] = nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    const r = Math.min(width, height) * 0.3;
    return {
      ...node,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      radius: 20 + node.betweenness * 40, // 20–60px based on centrality
    };
  });

  // Simple spring layout: 50 iterations
  for (let iter = 0; iter < 50; iter++) {
    const alpha = 1 - iter / 50;

    // Repulsion between all nodes
    for (let i = 0; i < layoutNodes.length; i++) {
      for (let j = i + 1; j < layoutNodes.length; j++) {
        const dx = layoutNodes[j].x - layoutNodes[i].x;
        const dy = layoutNodes[j].y - layoutNodes[i].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (500 * alpha) / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        layoutNodes[i].x -= fx;
        layoutNodes[i].y -= fy;
        layoutNodes[j].x += fx;
        layoutNodes[j].y += fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const a = layoutNodes.find((n) => n.botId === edge.from);
      const b = layoutNodes.find((n) => n.botId === edge.to);
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = (dist - 120) * 0.01 * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.x += fx;
      a.y += fy;
      b.x -= fx;
      b.y -= fy;
    }

    // Center gravity
    for (const node of layoutNodes) {
      node.x += (cx - node.x) * 0.01 * alpha;
      node.y += (cy - node.y) * 0.01 * alpha;
    }
  }

  // Clamp to bounds
  for (const node of layoutNodes) {
    node.x = Math.max(node.radius + 10, Math.min(width - node.radius - 10, node.x));
    node.y = Math.max(node.radius + 10, Math.min(height - node.radius - 10, node.y));
  }

  return layoutNodes;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function InterBotGraph({
  data,
  blastRadius,
  onNodeClick,
  onNodeHover,
  className,
}: InterBotGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });

  // Observe container size
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width || 600,
          height: entry.contentRect.height || 400,
        });
      }
    });
    observer.observe(svg.parentElement!);
    return () => observer.disconnect();
  }, []);

  // Compute layout
  const layoutNodes = useMemo(() => {
    if (!data) return [];
    return computeLayout(data.nodes, data.edges, dimensions.width, dimensions.height);
  }, [data, dimensions]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    for (const node of layoutNodes) map.set(node.botId, node);
    return map;
  }, [layoutNodes]);

  // Blast radius affected set
  const affectedSet = useMemo(() => {
    if (!blastRadius) return new Map<string, string>();
    return new Map(Object.entries(blastRadius.affected));
  }, [blastRadius]);

  const handleNodeHover = useCallback(
    (botId: string | null) => {
      setHoveredNode(botId);
      onNodeHover?.(botId);
    },
    [onNodeHover],
  );

  if (!data || data.nodes.length === 0) {
    return (
      <div className={cn(fleetCardStyles.default, "p-8 text-center", className)}>
        <Network className="mx-auto h-12 w-12 text-[#E0E0E0] mb-3" />
        <h3 className="text-sm font-medium text-[#2C2420]/60 mb-1">
          No Inter-Bot Communication
        </h3>
        <p className="text-xs text-[#2C2420]/40 max-w-xs mx-auto">
          Enable <code className="text-[#2A9D8F]">tools.agentToAgent</code> in bot config
          to see communication patterns between bots.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(fleetCardStyles.default, "overflow-hidden", className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#E0E0E0]/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-[#2A9D8F]" />
          <h3 className="text-sm font-medium text-[#2C2420]">Bot Communication Graph</h3>
          <span className={fleetInfoStyles.badge}>
            {data.nodes.length} bots &middot; {data.edges.length} links
          </span>
        </div>
        {blastRadius && (
          <div className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            {blastRadius.totalImpacted} bots affected
          </div>
        )}
      </div>

      {/* SVG Graph */}
      <svg
        ref={svgRef}
        className="w-full"
        style={{ height: 400 }}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      >
        {/* Ambient gradient background */}
        <defs>
          <radialGradient id="ambient-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#D4A373" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#FAF9F6" stopOpacity="0" />
          </radialGradient>
          {/* Arrow marker for directed edges */}
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#2C2420" opacity="0.3" />
          </marker>
        </defs>

        <rect
          width={dimensions.width}
          height={dimensions.height}
          fill="url(#ambient-glow)"
        />

        {/* Edges */}
        {data.edges.map((edge, i) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) return null;

          const isHighlighted =
            hoveredNode === edge.from || hoveredNode === edge.to;
          const strokeWidth = Math.max(1, Math.min(edge.weight, 5));

          return (
            <line
              key={`edge-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={isHighlighted ? "#D4A373" : "#2C2420"}
              strokeOpacity={isHighlighted ? 0.6 : 0.15}
              strokeWidth={isHighlighted ? strokeWidth + 1 : strokeWidth}
              strokeDasharray={edge.type === "message" ? "none" : "4 2"}
              markerEnd="url(#arrowhead)"
            />
          );
        })}

        {/* Nodes */}
        {layoutNodes.map((node) => {
          const isHovered = hoveredNode === node.botId;
          const impact = affectedSet.get(node.botId);
          const isOfflineBot = blastRadius?.offlineBot === node.botId;

          return (
            <g
              key={node.botId}
              transform={`translate(${node.x}, ${node.y})`}
              className="cursor-pointer"
              onMouseEnter={() => handleNodeHover(node.botId)}
              onMouseLeave={() => handleNodeHover(null)}
              onClick={() => onNodeClick?.(node.botId)}
            >
              {/* Blast radius ring */}
              {(impact || isOfflineBot) && (
                <circle
                  r={node.radius + 8}
                  fill="none"
                  stroke={isOfflineBot ? "#DC3545" : "#E07B39"}
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  opacity={0.6}
                />
              )}
              {/* Main circle */}
              <circle
                r={node.radius}
                fill={healthToColor(node.healthScore)}
                stroke={isHovered ? "#2C2420" : healthToStroke(node.healthScore)}
                strokeWidth={isHovered ? 2.5 : 1.5}
                opacity={impact ? 0.8 : 1}
              />
              {/* Emoji */}
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={node.radius * 0.8}
                className="select-none pointer-events-none"
              >
                {node.emoji}
              </text>
              {/* Label */}
              <text
                y={node.radius + 14}
                textAnchor="middle"
                fontSize={11}
                fill="#2C2420"
                opacity={0.7}
                className="select-none pointer-events-none"
              >
                {node.name}
              </text>
              {/* Impact badge */}
              {impact && (
                <text
                  y={-node.radius - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight="bold"
                  fill={
                    impact === "critical"
                      ? "#DC3545"
                      : impact === "high"
                        ? "#E07B39"
                        : "#D4A373"
                  }
                  className="select-none pointer-events-none"
                >
                  {impact.toUpperCase()}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-[#E0E0E0]/50 flex items-center gap-4 text-[10px] text-[#2C2420]/50">
        <span>Node size = centrality</span>
        <span>Color = health score</span>
        <span>Edge thickness = frequency</span>
        <span>Dashed = spawn/delegation</span>
      </div>
    </div>
  );
}
