/**
 * BotTagsManager — per-bot tag assignment (Dashboard tag system, Phase 2).
 *
 * The Dashboard can filter, group, and search bots by tag
 * (#255/#256/#264/#265) but nothing in the UI could ASSIGN a tag — the
 * addTag/removeTag endpoints (validated #116, tenant-guarded #215) had zero
 * consumers, so the whole tag feature was a dead-end. This surfaces it on
 * the Bot Detail page: current tags render as removable chips, and a small
 * form adds a new tag (label + category). The tag key is slugified from the
 * label so the operator only types a human label.
 */
import { useMemo, useState } from "react";
import { Tag as TagIcon, X, Plus, Loader2, AlertTriangle } from "lucide-react";
import { useFleetTags, useAddTag, useRemoveTag } from "@/hooks/useFleetMonitor";
import type { BotTag } from "@/api/fleet-monitor";
import { cn } from "@/lib/utils";

/** Categories the server accepts, with a default chip color each. */
const CATEGORIES: { value: BotTag["category"]; label: string; color: string }[] = [
  { value: "environment", label: "Environment", color: "#2A9D8F" },
  { value: "channel", label: "Channel", color: "#D4A373" },
  { value: "team", label: "Team", color: "#8B5CF6" },
  { value: "model", label: "Model", color: "#3B82F6" },
  { value: "custom", label: "Custom", color: "#6B7280" },
];

/** Slugify a human label into a tag key (server caps at 64 chars). */
function slugifyTag(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function BotTagsManager({
  botId,
  companyId,
}: {
  botId: string;
  companyId?: string | null;
}) {
  const { data: tagsData, isLoading, isError } = useFleetTags();
  const addTag = useAddTag();
  const removeTag = useRemoveTag();

  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<BotTag["category"]>("custom");
  const [formError, setFormError] = useState<string | null>(null);

  const botTags = useMemo(
    () => (tagsData?.tags ?? []).filter((t) => t.botId === botId),
    [tagsData, botId],
  );

  const canManage = !!companyId;

  const handleAdd = () => {
    setFormError(null);
    const trimmed = label.trim();
    if (!trimmed) {
      setFormError("Enter a tag label.");
      return;
    }
    const tag = slugifyTag(trimmed);
    if (!tag) {
      setFormError("Label must contain letters or numbers.");
      return;
    }
    if (botTags.some((t) => t.tag === tag)) {
      setFormError("This bot already has that tag.");
      return;
    }
    const color = CATEGORIES.find((c) => c.value === category)?.color;
    addTag.mutate(
      { botId, tag, label: trimmed.slice(0, 128), color, category },
      {
        onSuccess: () => {
          setLabel("");
          setCategory("custom");
        },
        onError: (err) => {
          setFormError(err instanceof Error ? err.message : "Failed to add tag.");
        },
      },
    );
  };

  return (
    <div
      className="rounded-xl border p-5 space-y-3"
      style={{
        backgroundColor: "color-mix(in srgb, var(--fleet-brand-bg) 90%, transparent)",
        borderColor: "color-mix(in srgb, var(--fleet-brand-primary) 13%, transparent)",
      }}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <TagIcon className="h-4 w-4 text-primary" />
        Tags
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading tags…
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Failed to load tags.
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {botTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {botTags.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
                  style={{
                    borderColor: t.color
                      ? `color-mix(in srgb, ${t.color} 40%, transparent)`
                      : undefined,
                    color: t.color ?? undefined,
                    backgroundColor: t.color
                      ? `color-mix(in srgb, ${t.color} 12%, transparent)`
                      : undefined,
                  }}
                >
                  {t.color && (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: t.color }}
                      aria-hidden="true"
                    />
                  )}
                  {t.label}
                  {t.autoAssigned && (
                    <span className="text-[10px] opacity-60">auto</span>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      aria-label={`Remove tag ${t.label}`}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-50"
                      disabled={
                        removeTag.isPending &&
                        removeTag.variables?.tag === t.tag
                      }
                      onClick={() => removeTag.mutate({ botId, tag: t.tag })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No tags yet.</p>
          )}

          {canManage ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
                placeholder="Add a tag (e.g. Production)"
                aria-label="New tag label"
                maxLength={128}
                className="min-w-40 flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as BotTag["category"])}
                aria-label="Tag category"
                className="rounded-lg border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAdd}
                disabled={addTag.isPending || !label.trim()}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground",
                  "hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {addTag.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Add
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Select a company to manage tags.
            </p>
          )}

          {formError && (
            <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>
          )}
        </>
      )}
    </div>
  );
}
