/**
 * Fleet Roles — All position definitions for Fleet org chart.
 *
 * Used by:
 * - Onboarding Wizard Step 2 (role selection checkboxes)
 * - Org chart rendering (hierarchy by level)
 * - Bot assignment (drag-drop target positions)
 * - Dashboard bot cards (role display)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FleetRole {
  /** Unique identifier, e.g. "ceo", "head-engineering" */
  id: string;
  /** English title shown in UI */
  title: string;
  /** Chinese subtitle / translation */
  subtitle: string;
  /** Hierarchy level: 1 = top (CEO), 2 = C-suite, 3 = heads, 4 = ICs */
  level: 1 | 2 | 3 | 4;
  /** Which C-suite role this position reports to (for org chart edges) */
  reportsTo?: string;
  /** Default emoji for vacant position placeholder */
  defaultEmoji?: string;
}

export type RoleCategory = "c-suite" | "head" | "individual";

export interface RoleCategoryMeta {
  label: string;
  labelZh: string;
  description: string;
}

export interface OrgChartNode {
  role: FleetRole;
  /** Assigned bot ID, or null if vacant */
  botId: string | null;
  /** Children nodes in the org hierarchy */
  children: OrgChartNode[];
}

export interface CustomRole extends FleetRole {
  /** Custom roles are always user-created */
  isCustom: true;
}

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

export const ROLE_CATEGORIES: Record<RoleCategory, RoleCategoryMeta> = {
  "c-suite": {
    label: "C-Suite",
    labelZh: "高層",
    description: "Executive leadership positions",
  },
  head: {
    label: "Head Level",
    labelZh: "部門主管",
    description: "Department heads reporting to C-suite",
  },
  individual: {
    label: "Individual Contributors",
    labelZh: "執行層",
    description: "Specialists and team members",
  },
};

// ---------------------------------------------------------------------------
// Role definitions — matching ONBOARDING_SPEC.md exactly
// ---------------------------------------------------------------------------

export const FLEET_ROLES: Record<RoleCategory, FleetRole[]> = {
  "c-suite": [
    { id: "ceo", title: "CEO", subtitle: "執行長 / 總指揮", level: 1, defaultEmoji: "👑" },
    { id: "cto", title: "CTO", subtitle: "技術長", level: 2, reportsTo: "ceo", defaultEmoji: "⚙️" },
    { id: "cmo", title: "CMO", subtitle: "行銷長", level: 2, reportsTo: "ceo", defaultEmoji: "📣" },
    { id: "cfo", title: "CFO", subtitle: "財務長", level: 2, reportsTo: "ceo", defaultEmoji: "💰" },
    { id: "coo", title: "COO", subtitle: "營運長", level: 2, reportsTo: "ceo", defaultEmoji: "🏭" },
    { id: "cio", title: "CIO", subtitle: "資訊長", level: 2, reportsTo: "ceo", defaultEmoji: "🖥️" },
    { id: "cso", title: "CSO", subtitle: "安全長", level: 2, reportsTo: "ceo", defaultEmoji: "🛡️" },
  ],
  head: [
    { id: "head-engineering", title: "Head of Engineering", subtitle: "工程主管", level: 3, reportsTo: "cto", defaultEmoji: "🔧" },
    { id: "head-marketing", title: "Head of Marketing", subtitle: "行銷主管", level: 3, reportsTo: "cmo", defaultEmoji: "📢" },
    { id: "head-sales", title: "Head of Sales", subtitle: "業務主管", level: 3, reportsTo: "cmo", defaultEmoji: "🤝" },
    { id: "head-research", title: "Head of Research", subtitle: "研究主管", level: 3, reportsTo: "cto", defaultEmoji: "🔬" },
    { id: "head-design", title: "Head of Design", subtitle: "設計主管", level: 3, reportsTo: "cmo", defaultEmoji: "🎨" },
    { id: "head-content", title: "Head of Content", subtitle: "內容主管", level: 3, reportsTo: "cmo", defaultEmoji: "✏️" },
    { id: "head-cs", title: "Head of Customer Success", subtitle: "客戶成功主管", level: 3, reportsTo: "coo", defaultEmoji: "🌟" },
    { id: "head-ops", title: "Head of Operations", subtitle: "營運主管", level: 3, reportsTo: "coo", defaultEmoji: "📋" },
    { id: "head-hr", title: "Head of HR", subtitle: "人資主管", level: 3, reportsTo: "coo", defaultEmoji: "👥" },
  ],
  individual: [
    { id: "sr-engineer", title: "Senior Engineer", subtitle: "資深工程師", level: 4, reportsTo: "head-engineering", defaultEmoji: "💻" },
    { id: "engineer", title: "Engineer", subtitle: "工程師", level: 4, reportsTo: "head-engineering", defaultEmoji: "⌨️" },
    { id: "marketing-spec", title: "Marketing Specialist", subtitle: "行銷專員", level: 4, reportsTo: "head-marketing", defaultEmoji: "📊" },
    { id: "content-creator", title: "Content Creator", subtitle: "內容創作者", level: 4, reportsTo: "head-content", defaultEmoji: "🖊️" },
    { id: "designer", title: "Designer", subtitle: "設計師", level: 4, reportsTo: "head-design", defaultEmoji: "🎯" },
    { id: "data-analyst", title: "Data Analyst", subtitle: "數據分析師", level: 4, reportsTo: "head-research", defaultEmoji: "📈" },
    { id: "researcher", title: "Researcher", subtitle: "研究員", level: 4, reportsTo: "head-research", defaultEmoji: "🧪" },
    { id: "customer-support", title: "Customer Support", subtitle: "客服專員", level: 4, reportsTo: "head-cs", defaultEmoji: "💬" },
    { id: "sales-rep", title: "Sales Rep", subtitle: "業務代表", level: 4, reportsTo: "head-sales", defaultEmoji: "📞" },
    { id: "qa-engineer", title: "QA Engineer", subtitle: "測試工程師", level: 4, reportsTo: "head-engineering", defaultEmoji: "🧪" },
    { id: "devops", title: "DevOps Engineer", subtitle: "維運工程師", level: 4, reportsTo: "head-engineering", defaultEmoji: "🚀" },
    { id: "pm", title: "Project Manager", subtitle: "專案經理", level: 4, reportsTo: "head-ops", defaultEmoji: "📅" },
    { id: "admin", title: "Admin Assistant", subtitle: "行政助理", level: 4, reportsTo: "head-hr", defaultEmoji: "📎" },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flat array of all predefined roles */
export function getAllRoles(): FleetRole[] {
  return [
    ...FLEET_ROLES["c-suite"],
    ...FLEET_ROLES["head"],
    ...FLEET_ROLES["individual"],
  ];
}

/** Look up a role by ID across all categories */
export function getRoleById(id: string): FleetRole | undefined {
  return getAllRoles().find((r) => r.id === id);
}

/** Get roles grouped by level for org chart rendering */
export function getRolesByLevel(selectedIds: string[]): Map<number, FleetRole[]> {
  const roles = getAllRoles().filter((r) => selectedIds.includes(r.id));
  const byLevel = new Map<number, FleetRole[]>();
  for (const role of roles) {
    const existing = byLevel.get(role.level) ?? [];
    existing.push(role);
    byLevel.set(role.level, existing);
  }
  return byLevel;
}

/**
 * Build an org chart tree from selected role IDs.
 * Returns the root nodes (level 1) with children populated recursively.
 */
export function buildOrgTree(selectedIds: string[]): OrgChartNode[] {
  const selected = getAllRoles().filter((r) => selectedIds.includes(r.id));
  const nodeMap = new Map<string, OrgChartNode>();

  // Create nodes
  for (const role of selected) {
    nodeMap.set(role.id, { role, botId: null, children: [] });
  }

  // Wire parent-child relationships
  const roots: OrgChartNode[] = [];
  for (const role of selected) {
    const node = nodeMap.get(role.id)!;
    if (role.reportsTo && nodeMap.has(role.reportsTo)) {
      nodeMap.get(role.reportsTo)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Create a custom role with a unique ID.
 * Custom roles default to level 4 (IC) unless specified.
 */
export function createCustomRole(
  title: string,
  subtitle: string,
  options?: { level?: 1 | 2 | 3 | 4; reportsTo?: string },
): CustomRole {
  const id = `custom-${title.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  return {
    id,
    title,
    subtitle,
    level: options?.level ?? 4,
    reportsTo: options?.reportsTo,
    isCustom: true,
  };
}

/**
 * Get the display label for a role (English + Chinese).
 * e.g. "CEO — 執行長 / 總指揮"
 */
export function getRoleDisplayLabel(role: FleetRole): string {
  return `${role.title} — ${role.subtitle}`;
}

/**
 * Get edges for org chart SVG rendering.
 * Returns pairs of [parentId, childId] for selected roles.
 */
export function getOrgChartEdges(selectedIds: string[]): [string, string][] {
  const idSet = new Set(selectedIds);
  const edges: [string, string][] = [];
  const allRoles = getAllRoles().filter((r) => idSet.has(r.id));

  for (const role of allRoles) {
    if (role.reportsTo && idSet.has(role.reportsTo)) {
      edges.push([role.reportsTo, role.id]);
    }
  }
  return edges;
}
