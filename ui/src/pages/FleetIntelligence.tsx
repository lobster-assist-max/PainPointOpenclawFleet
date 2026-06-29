/**
 * Fleet Intelligence page.
 *
 * Surfaces the advanced fleet-intelligence widgets (trust graduation,
 * A2A mesh, playbooks, conversation analytics, customer journeys,
 * config drift, secrets vault) behind a tab switcher.
 *
 * These widgets were fully built but previously unrendered — this page
 * is the single place they are exposed to operators. Widgets backed by
 * placeholder data carry their own [Preview] badge so live vs. demo data
 * stays distinguishable.
 */

import { useEffect, useState, type ReactNode } from "react";
import {
  Crown,
  Share2,
  PlayCircle,
  MessageSquare,
  Route as RouteIcon,
  GitCompare,
  KeyRound,
} from "lucide-react";
import {
  TrustGraduationWidget,
  A2AMeshWidget,
  PlaybookWidget,
  ConversationAnalyticsWidget,
  CustomerJourneyWidget,
  ConfigDriftWidget,
  SecretsVaultWidget,
} from "@/components/fleet";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn } from "@/lib/utils";

interface TabDef {
  key: string;
  label: string;
  icon: typeof Crown;
  render: () => ReactNode;
}

const TABS: TabDef[] = [
  { key: "trust", label: "Trust", icon: Crown, render: () => <TrustGraduationWidget /> },
  { key: "a2a", label: "A2A Mesh", icon: Share2, render: () => <A2AMeshWidget /> },
  { key: "playbooks", label: "Playbooks", icon: PlayCircle, render: () => <PlaybookWidget /> },
  { key: "conversations", label: "Conversations", icon: MessageSquare, render: () => <ConversationAnalyticsWidget /> },
  { key: "journeys", label: "Journeys", icon: RouteIcon, render: () => <CustomerJourneyWidget /> },
  { key: "drift", label: "Config Drift", icon: GitCompare, render: () => <ConfigDriftWidget /> },
  { key: "secrets", label: "Secrets", icon: KeyRound, render: () => <SecretsVaultWidget /> },
];

export function FleetIntelligence() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const [activeTab, setActiveTab] = useState<string>(TABS[0]!.key);

  useEffect(() => {
    setBreadcrumbs([{ label: "Intelligence" }]);
  }, [setBreadcrumbs]);

  const active = TABS.find((t) => t.key === activeTab) ?? TABS[0]!;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Fleet Intelligence</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Advanced fleet analytics — trust graduation, agent-to-agent routing, playbooks,
          conversation quality, customer journeys, config drift, and secrets
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === activeTab;
          return (
            <button
              type="button"
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              aria-pressed={isActive}
              className={cn(
                "relative px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-1.5">
                <Icon className="w-4 h-4" />
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      {/* Active widget */}
      <div>{active.render()}</div>
    </div>
  );
}
