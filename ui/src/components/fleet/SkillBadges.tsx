/**
 * SkillBadges — Displays a list of skill tags with "+N more" overflow.
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface SkillBadgesProps {
  skills: string[];
  limit?: number;
  className?: string;
}

export function SkillBadges({ skills, limit = 5, className }: SkillBadgesProps) {
  const [expanded, setExpanded] = useState(false);
  // Dedupe (case-insensitively, keeping the first spelling) — a gateway that
  // reports the same skill twice, or a backfill that re-adds an existing skill,
  // would otherwise render duplicate badges with duplicate React keys.
  const uniqueSkills = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of skills) {
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out;
  }, [skills]);
  const visible = expanded ? uniqueSkills : uniqueSkills.slice(0, limit);
  const remaining = uniqueSkills.length - limit;

  if (uniqueSkills.length === 0) return null;

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
        {expanded && uniqueSkills.length > limit && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded(false);
            }}
            className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}
