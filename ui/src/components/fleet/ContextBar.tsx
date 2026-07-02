/**
 * ContextBar — Reusable context usage progress bar.
 * Shows token count, percentage, and color-coded fill.
 */

import { cn } from "@/lib/utils";
import { formatTokenCount, contextBarColor } from "@/lib/bot-display-helpers";

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
      <div
        className="h-2 w-full rounded-full bg-muted/40 overflow-hidden"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} usage ${percent}%`}
      >
        <div
          className={cn("h-full rounded-full transition-all", contextBarColor(percent))}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
