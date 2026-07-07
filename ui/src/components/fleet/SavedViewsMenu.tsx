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
import { Bookmark, BookmarkPlus, Trash2, Check, X, Star, Download, Upload, ChevronUp, ChevronDown, Pencil, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type DashboardView,
  type SavedView,
  loadSavedViews,
  saveView,
  deleteSavedView,
  moveSavedView,
  renameSavedView,
  duplicateSavedView,
  loadDefaultViewName,
  saveDefaultViewName,
  exportSavedViews,
  importSavedViews,
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
  onNotify,
}: {
  current: DashboardView;
  onApply: (view: DashboardView) => void;
  /** The current view is worth saving (i.e. it's customised away from default). */
  canSave: boolean;
  /** Surface an export/import result (wired to a toast by the dashboard). */
  onNotify?: (message: string, ok: boolean) => void;
}) {
  const [views, setViews] = useState<SavedView[]>(() => loadSavedViews());
  const [defaultName, setDefaultName] = useState<string | null>(() => loadDefaultViewName());
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  // Inline rename: the name of the view being renamed (null = none) + its
  // working value + a conflict/empty error.
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setNaming(false);
        cancelRename();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setNaming(false);
        cancelRename();
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

  useEffect(() => {
    if (renaming) renameRef.current?.select();
  }, [renaming]);

  const startRename = (viewName: string) => {
    setNaming(false);
    setRenaming(viewName);
    setRenameValue(viewName);
    setRenameError(null);
  };

  const cancelRename = () => {
    setRenaming(null);
    setRenameValue("");
    setRenameError(null);
  };

  const handleRenameConfirm = (oldName: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError("Name can't be empty.");
      return;
    }
    const result = renameSavedView(oldName, trimmed);
    if (!result) {
      setRenameError("A view with that name already exists.");
      return;
    }
    setViews(result);
    // The default pointer follows a rename; mirror it in local state.
    setDefaultName(loadDefaultViewName());
    cancelRename();
  };

  // Fork a saved view under a unique "(copy)" name so an operator can create a
  // variant without rebuilding it.
  const handleDuplicate = (viewName: string) => {
    cancelRename();
    setViews(duplicateSavedView(viewName));
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setViews(saveView({ ...current, name: trimmed }));
    setName("");
    setNaming(false);
  };

  const handleDelete = (viewName: string) => {
    cancelRename();
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

  // Reorder a view up/down — controls both the menu order and which view each
  // number-key shortcut (1–9) applies (#341).
  const handleMove = (viewName: string, direction: "up" | "down") => {
    cancelRename();
    setViews(moveSavedView(viewName, direction));
  };

  // Download the whole saved-views set as a portable JSON file (backup / share
  // between machines or operators).
  const handleExport = () => {
    try {
      const blob = new Blob([exportSavedViews()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fleet-saved-views.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      onNotify?.("Couldn't export saved views.", false);
    }
  };

  // Read a JSON file and MERGE its views into the existing set (never replaces).
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { views: next, imported, skipped } = importSavedViews(String(reader.result ?? ""));
        setViews(next);
        setDefaultName(loadDefaultViewName());
        const parts = [`Imported ${imported} view${imported !== 1 ? "s" : ""}`];
        if (skipped) parts.push(`${skipped} skipped`);
        onNotify?.(parts.join(" · "), imported > 0);
      } catch (err) {
        onNotify?.(err instanceof Error ? err.message : "Couldn't read that file.", false);
      }
    };
    reader.onerror = () => onNotify?.("Couldn't read that file.", false);
    reader.readAsText(file);
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
                if (renaming === v.name) {
                  return (
                    <li key={v.name} className="px-1 py-1">
                      <div className="flex items-center gap-1">
                        <input
                          ref={renameRef}
                          value={renameValue}
                          onChange={(e) => {
                            setRenameValue(e.target.value);
                            setRenameError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameConfirm(v.name);
                            else if (e.key === "Escape") {
                              e.stopPropagation();
                              cancelRename();
                            }
                          }}
                          maxLength={40}
                          aria-label={`Rename view ${v.name}`}
                          className="flex-1 min-w-0 rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                          type="button"
                          onClick={() => handleRenameConfirm(v.name)}
                          aria-label="Save name"
                          className="rounded-md p-1 text-primary hover:bg-primary/10"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          aria-label="Cancel rename"
                          className="rounded-md p-1 text-muted-foreground hover:bg-accent"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {renameError && (
                        <p className="px-1 pt-1 text-[10px] text-red-500">{renameError}</p>
                      )}
                    </li>
                  );
                }
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
                    {/* Reorder controls — set which view each 1–9 shortcut applies. */}
                    <span className="flex flex-col justify-center opacity-0 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        onClick={() => handleMove(v.name, "up")}
                        disabled={i === 0}
                        aria-label={`Move ${v.name} up`}
                        title="Move up"
                        className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-default"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(v.name, "down")}
                        disabled={i === views.length - 1}
                        aria-label={`Move ${v.name} down`}
                        title="Move down"
                        className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-default"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(v.name)}
                      aria-label={`Duplicate view ${v.name}`}
                      title="Duplicate this view"
                      className="px-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary transition"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startRename(v.name)}
                      aria-label={`Rename view ${v.name}`}
                      title="Rename this view"
                      className="px-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition"
                    >
                      <Pencil className="h-3.5 w-3.5" />
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

          {/* Export / import the whole saved-views set as JSON — back it up,
              move it to another machine, or share it with another operator. */}
          <div className="mt-1 flex items-center gap-1 border-t pt-1.5">
            <button
              type="button"
              onClick={handleExport}
              disabled={views.length === 0}
              title="Download all saved views as a JSON file"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Import views from a JSON file (merges into your saved views)"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="hidden"
              aria-hidden="true"
            />
          </div>
        </div>
      )}
    </div>
  );
}
