/**
 * ContextBar — Reusable context usage progress bar.
 * Shows token count, percentage, and color-coded fill.
 */

import { cn } from "@/lib/utils";

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function barColor(percent: number): string {
  if (percent > 80) return "bg-red-500";
  if (percent >= 50) return "bg-yellow-500";
  return "bg-green-500";
}

interface ContextBarProps {
  tokens: number;
  maxTokens: number;
  label?: string;
  className?: string;
}

export function ContextBar({ tokens, maxTokens, label = "Context", className }: ContextBarProps) {
  const percent = maxTokens > 0 ? Math.min(100, Math.round((tokens / maxTokens) * 100)) : 0;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          {percent}% ({formatTokenCount(tokens)}/{formatTokenCount(maxTokens)})
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor(percent))}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
