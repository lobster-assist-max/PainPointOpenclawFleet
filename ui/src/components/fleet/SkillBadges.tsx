/**
 * SkillBadges — Displays a list of skill tags with "+N more" overflow.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

interface SkillBadgesProps {
  skills: string[];
  limit?: number;
  className?: string;
}

export function SkillBadges({ skills, limit = 5, className }: SkillBadgesProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? skills : skills.slice(0, limit);
  const remaining = skills.length - limit;

  if (skills.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <span className="text-xs text-muted-foreground">Skills</span>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((skill) => (
          <span
            key={skill}
            className="inline-flex items-center rounded-md bg-fleet-primary/10 px-2 py-0.5 text-xs font-medium text-foreground"
          >
            {skill}
          </span>
        ))}
        {!expanded && remaining > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded(true);
            }}
            className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            +{remaining} more
          </button>
        )}
      </div>
    </div>
  );
}
