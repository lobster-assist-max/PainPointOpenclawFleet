/**
 * SavedViewsMenu — save the current Fleet Dashboard view (filter + sort +
 * sort-direction + group + grid/list) as a named preset, and one-click re-apply
 * or delete saved views.
 *
 * The URL already makes a view shareable (#333/#335) and Reset returns to the
 * default grid (#337), but there was no way to NAME a favourite view and jump
 * back to it (e.g. "Over budget, by cost" or "Failing bots, grouped by role").
 * This closes that gap. Views are cross-company (filter/sort config, not
 * bot-specific), persisted globally via dashboard-prefs.
 */
import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkPlus, Trash2, Check, X, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type DashboardView,
  type SavedView,
  loadSavedViews,
  saveView,
  deleteSavedView,
  loadDefaultViewName,
  saveDefaultViewName,
} from "@/lib/dashboard-prefs";

// Short human labels for the compact one-line summary under each saved view.
const SORT_LABEL: Record<string, string> = {
  attention: "Attention",
  health: "Health",
  cost: "Cost",
  budget: "Budget",
  sessions: "Sessions",
  context: "Context",
  channels: "Channels",
  uptime: "Uptime",
  role: "Role",
  name: "Name",
  lastActive: "Last active",
};
const GROUP_LABEL: Record<string, string> = {
  none: "",
  status: "Status",
  grade: "Grade",
  role: "Role",
  environment: "Environment",
  channel: "Channel",
  team: "Team",
  model: "Model",
};

function summarize(v: DashboardView): string {
  const parts: string[] = [];
  parts.push(`${SORT_LABEL[v.sortBy] ?? v.sortBy}${v.sortDir === "reversed" ? " ↑" : " ↓"}`);
  if (v.groupBy !== "none") parts.push(`by ${GROUP_LABEL[v.groupBy] ?? v.groupBy}`);
  if (v.viewMode === "list") parts.push("list");
  if (v.searchQuery) parts.push(`“${v.searchQuery}”`);
  return parts.join(" · ");
}

// Two views are equal when every view dimension matches (used to highlight the
// currently-active saved view in the list).
function viewsEqual(a: DashboardView, b: DashboardView): boolean {
  return (
    a.searchQuery === b.searchQuery &&
    a.sortBy === b.sortBy &&
    a.sortDir === b.sortDir &&
    a.groupBy === b.groupBy &&
    a.viewMode === b.viewMode
  );
}

export function SavedViewsMenu({
  current,
  onApply,
  canSave,
}: {
  current: DashboardView;
  onApply: (view: DashboardView) => void;
  /** The current view is worth saving (i.e. it's customised away from default). */
  canSave: boolean;
}) {
  const [views, setViews] = useState<SavedView[]>(() => loadSavedViews());
  const [defaultName, setDefaultName] = useState<string | null>(() => loadDefaultViewName());
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setNaming(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setNaming(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (naming) inputRef.current?.focus();
  }, [naming]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setViews(saveView({ ...current, name: trimmed }));
    setName("");
    setNaming(false);
  };

  const handleDelete = (viewName: string) => {
    setViews(deleteSavedView(viewName));
    // deleteSavedView clears the default if it pointed at this view; mirror that
    // in local state so the star updates immediately.
    setDefaultName(loadDefaultViewName());
  };

  // Toggle a view as the default landing view (auto-applied on a fresh
  // `/dashboard` visit). Clicking the current default clears it.
  const handleToggleDefault = (viewName: string) => {
    const next = defaultName?.toLowerCase() === viewName.toLowerCase() ? null : viewName;
    saveDefaultViewName(next);
    setDefaultName(next);
  };

  const activeName = views.find((v) => viewsEqual(v, current))?.name ?? null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
          open || activeName
            ? "border-primary/40 bg-primary/10 text-primary"
            : "hover:bg-accent",
        )}
        title="Save and switch between named dashboard views"
      >
        <Bookmark className="h-3.5 w-3.5" />
        {activeName ? `View: ${activeName}` : `Views${views.length ? ` (${views.length})` : ""}`}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-72 rounded-lg border bg-background shadow-lg p-1.5"
        >
          {views.length === 0 && !naming && (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              No saved views yet. Save the current filter, sort, and grouping as a
              reusable preset.
            </p>
          )}

          {views.length > 0 && (
            <ul className="max-h-64 overflow-y-auto">
              {views.map((v, i) => {
                const isActive = v.name === activeName;
                const isDefault = defaultName?.toLowerCase() === v.name.toLowerCase();
                return (
                  <li key={v.name} className="group flex items-stretch">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onApply(v);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex-1 min-w-0 rounded-md px-2 py-1.5 text-left transition-colors",
                        isActive ? "bg-primary/10" : "hover:bg-accent",
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {isActive && <Check className="h-3 w-3 shrink-0 text-primary" />}
                        {i < 9 && (
                          <kbd
                            className="shrink-0 rounded border border-border bg-muted px-1 text-[10px] font-medium text-muted-foreground"
                            title={`Press ${i + 1} to apply this view`}
                          >
                            {i + 1}
                          </kbd>
                        )}
                        <span className="truncate text-xs font-medium text-foreground">
                          {v.name}
                        </span>
                        {isDefault && (
                          <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                            Default
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {summarize(v)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleDefault(v.name)}
                      aria-label={
                        isDefault
                          ? `Unset ${v.name} as default view`
                          : `Set ${v.name} as default view`
                      }
                      aria-pressed={isDefault}
                      title={
                        isDefault
                          ? "Default landing view — click to unset"
                          : "Set as default landing view (auto-applied on a fresh visit)"
                      }
                      className={cn(
                        "px-1.5 transition",
                        isDefault
                          ? "text-amber-500"
                          : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-amber-500",
                      )}
                    >
                      <Star className={cn("h-3.5 w-3.5", isDefault && "fill-current")} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(v.name)}
                      aria-label={`Delete view ${v.name}`}
                      title={`Delete view "${v.name}"`}
                      className="px-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-1 border-t pt-1.5">
            {naming ? (
              <div className="flex items-center gap-1 px-1">
                <input
                  ref={inputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    else if (e.key === "Escape") {
                      setNaming(false);
                      setName("");
                    }
                  }}
                  maxLength={40}
                  placeholder="View name…"
                  aria-label="Name this view"
                  className="flex-1 min-w-0 rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!name.trim()}
                  aria-label="Save view"
                  className="rounded-md p-1 text-primary hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNaming(false);
                    setName("");
                  }}
                  aria-label="Cancel"
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNaming(true)}
                disabled={!canSave}
                title={
                  canSave
                    ? "Save the current view as a named preset"
                    : "Customise the view (filter/sort/group) first, then save it"
                }
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                Save current view…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
