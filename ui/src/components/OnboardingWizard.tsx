import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdapterEnvironmentTestResult } from "@paperclipai/shared";
import { useLocation, useNavigate, useParams } from "@/lib/router";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { companiesApi } from "../api/companies";
import { goalsApi } from "../api/goals";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import {
  extractModelName,
  extractProviderIdWithFallback
} from "../lib/model-utils";
import { getUIAdapter } from "../adapters";
import { defaultCreateValues } from "./agent-config-defaults";
import { parseOnboardingGoalInput } from "../lib/onboarding-goal";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL
} from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";
import { resolveRouteOnboardingOptions } from "../lib/onboarding-route";
import {
  FLEET_ROLES,
  ROLE_CATEGORIES,
  buildOrgTree,
  type FleetRole,
  type RoleCategory,
  type OrgChartNode,
} from "../lib/fleet-roles";
import { BotConnectStep, type BotAssignment } from "./fleet/BotConnectStep";

import { ChoosePathButton } from "./PathInstructionsModal";
import { HintIcon } from "./agent-config-primitives";
import { OpenCodeLogoIcon } from "./OpenCodeLogoIcon";
import {
  Building2,
  Bot,
  Code,
  Gem,
  ListTodo,
  Rocket,
  ArrowLeft,
  ArrowRight,
  Terminal,
  Sparkles,
  MousePointer2,
  Check,
  Loader2,
  FolderOpen,
  ChevronDown,
  Users,
  Plus,
  X
} from "lucide-react";

type Step = 1 | 2 | 3 | 4;
type AdapterType =
  | "claude_local"
  | "codex_local"
  | "gemini_local"
  | "opencode_local"
  | "pi_local"
  | "cursor"
  | "process"
  | "http"
  | "openclaw_gateway";

const DEFAULT_TASK_DESCRIPTION = `Setup yourself as the CEO of this fleet.

Ensure you have a folder agents/ceo and then create your AGENTS.md, HEARTBEAT.md, SOUL.md, and TOOLS.md instruction files.

After that, connect a Founding Engineer bot and then plan the roadmap and tasks for your new fleet.`;

export function OnboardingWizard() {
  const { onboardingOpen, onboardingOptions, closeOnboarding } = useDialog();
  const { companies, setSelectedCompanyId, loading: companiesLoading } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();
  const [routeDismissed, setRouteDismissed] = useState(false);

  const routeOnboardingOptions =
    companyPrefix && companiesLoading
      ? null
      : resolveRouteOnboardingOptions({
          pathname: location.pathname,
          companyPrefix,
          companies,
        });
  const effectiveOnboardingOpen =
    onboardingOpen || (routeOnboardingOptions !== null && !routeDismissed);
  const effectiveOnboardingOptions = onboardingOpen
    ? onboardingOptions
    : routeOnboardingOptions ?? {};

  const initialStep = effectiveOnboardingOptions.initialStep ?? 1;
  const existingCompanyId = effectiveOnboardingOptions.companyId;

  const [step, setStep] = useState<Step>(initialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  // Step 1
  const [companyName, setCompanyName] = useState("");
  const [companyGoal, setCompanyGoal] = useState("");

  // Step 2
  const [agentName, setAgentName] = useState("CEO");
  const [adapterType, setAdapterType] = useState<AdapterType>("claude_local");
  const [cwd, setCwd] = useState("");
  const [model, setModel] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [adapterEnvResult, setAdapterEnvResult] =
    useState<AdapterEnvironmentTestResult | null>(null);
  const [adapterEnvError, setAdapterEnvError] = useState<string | null>(null);
  const [adapterEnvLoading, setAdapterEnvLoading] = useState(false);
  const [forceUnsetAnthropicApiKey, setForceUnsetAnthropicApiKey] =
    useState(false);
  const [unsetAnthropicLoading, setUnsetAnthropicLoading] = useState(false);
  const [showMoreAdapters, setShowMoreAdapters] = useState(false);

  // Step 2 — Role Selection
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["ceo"]);
  const [customRoleTitle, setCustomRoleTitle] = useState("");

  // Step 3 — Bot Assignments (drag-drop)
  const [assignments, setAssignments] = useState<BotAssignment[]>([]);

  // Step 3
  const [taskTitle, setTaskTitle] = useState("Create your CEO HEARTBEAT.md");
  const [taskDescription, setTaskDescription] = useState(
    DEFAULT_TASK_DESCRIPTION
  );

  // Auto-grow textarea for task description
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  // Created entity IDs — pre-populate from existing company when skipping step 1
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(
    existingCompanyId ?? null
  );
  const [createdCompanyPrefix, setCreatedCompanyPrefix] = useState<
    string | null
  >(null);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [createdIssueRef, setCreatedIssueRef] = useState<string | null>(null);

  useEffect(() => {
    setRouteDismissed(false);
  }, [location.pathname]);

  // Sync step and company when onboarding opens with options.
  // Keep this independent from company-list refreshes so Step 1 completion
  // doesn't get reset after creating a company.
  useEffect(() => {
    if (!effectiveOnboardingOpen) return;
    const cId = effectiveOnboardingOptions.companyId ?? null;
    setStep(effectiveOnboardingOptions.initialStep ?? 1);
    setCreatedCompanyId(cId);
    setCreatedCompanyPrefix(null);
  }, [
    effectiveOnboardingOpen,
    effectiveOnboardingOptions.companyId,
    effectiveOnboardingOptions.initialStep
  ]);

  // Backfill issue prefix for an existing company once companies are loaded.
  useEffect(() => {
    if (!effectiveOnboardingOpen || !createdCompanyId || createdCompanyPrefix) return;
    const company = companies.find((c) => c.id === createdCompanyId);
    if (company) setCreatedCompanyPrefix(company.issuePrefix);
  }, [effectiveOnboardingOpen, createdCompanyId, createdCompanyPrefix, companies]);

  // Resize textarea when step 3 is shown or description changes
  useEffect(() => {
    if (step === 3) autoResizeTextarea();
  }, [step, taskDescription, autoResizeTextarea]);

  const {
    data: adapterModels,
    error: adapterModelsError,
    isLoading: adapterModelsLoading,
    isFetching: adapterModelsFetching
  } = useQuery({
    queryKey: createdCompanyId
      ? queryKeys.agents.adapterModels(createdCompanyId, adapterType)
      : ["agents", "none", "adapter-models", adapterType],
    queryFn: () => agentsApi.adapterModels(createdCompanyId!, adapterType),
    enabled: Boolean(createdCompanyId) && effectiveOnboardingOpen && step === 2
  });
  const isLocalAdapter =
    adapterType === "claude_local" ||
    adapterType === "codex_local" ||
    adapterType === "gemini_local" ||
    adapterType === "opencode_local" ||
    adapterType === "cursor";
  const effectiveAdapterCommand =
    command.trim() ||
    (adapterType === "codex_local"
      ? "codex"
      : adapterType === "gemini_local"
        ? "gemini"
      : adapterType === "cursor"
      ? "agent"
      : adapterType === "opencode_local"
      ? "opencode"
      : "claude");

  useEffect(() => {
    if (step !== 2) return;
    setAdapterEnvResult(null);
    setAdapterEnvError(null);
  }, [step, adapterType, cwd, model, command, args, url]);

  const selectedModel = (adapterModels ?? []).find((m) => m.id === model);
  const hasAnthropicApiKeyOverrideCheck =
    adapterEnvResult?.checks.some(
      (check) =>
        check.code === "claude_anthropic_api_key_overrides_subscription"
    ) ?? false;
  const shouldSuggestUnsetAnthropicApiKey =
    adapterType === "claude_local" &&
    adapterEnvResult?.status === "fail" &&
    hasAnthropicApiKeyOverrideCheck;
  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    return (adapterModels ?? []).filter((entry) => {
      if (!query) return true;
      const provider = extractProviderIdWithFallback(entry.id, "");
      return (
        entry.id.toLowerCase().includes(query) ||
        entry.label.toLowerCase().includes(query) ||
        provider.toLowerCase().includes(query)
      );
    });
  }, [adapterModels, modelSearch]);
  const groupedModels = useMemo(() => {
    if (adapterType !== "opencode_local") {
      return [
        {
          provider: "models",
          entries: [...filteredModels].sort((a, b) => a.id.localeCompare(b.id))
        }
      ];
    }
    const groups = new Map<string, Array<{ id: string; label: string }>>();
    for (const entry of filteredModels) {
      const provider = extractProviderIdWithFallback(entry.id);
      const bucket = groups.get(provider) ?? [];
      bucket.push(entry);
      groups.set(provider, bucket);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, entries]) => ({
        provider,
        entries: [...entries].sort((a, b) => a.id.localeCompare(b.id))
      }));
  }, [filteredModels, adapterType]);

  function toggleRole(roleId: string) {
    setSelectedRoles((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId]
    );
  }

  function handleStep2RolesNext() {
    if (selectedRoles.length === 0) {
      setError("Select at least one role for your org chart.");
      return;
    }
    setError(null);
    setStep(3);
  }

  function reset() {
    setStep(1);
    setLoading(false);
    setError(null);
    setCompanyName("");
    setCompanyGoal("");
    setSelectedRoles(["ceo"]);
    setCustomRoleTitle("");
    setAssignments([]);
    setAgentName("CEO");
    setAdapterType("claude_local");
    setCwd("");
    setModel("");
    setCommand("");
    setArgs("");
    setUrl("");
    setAdapterEnvResult(null);
    setAdapterEnvError(null);
    setAdapterEnvLoading(false);
    setForceUnsetAnthropicApiKey(false);
    setUnsetAnthropicLoading(false);
    setTaskTitle("Create your CEO HEARTBEAT.md");
    setTaskDescription(DEFAULT_TASK_DESCRIPTION);
    setCreatedCompanyId(null);
    setCreatedCompanyPrefix(null);
    setCreatedAgentId(null);
    setCreatedIssueRef(null);
  }

  function handleClose() {
    reset();
    closeOnboarding();
  }

  function buildAdapterConfig(): Record<string, unknown> {
    const adapter = getUIAdapter(adapterType);
    const config = adapter.buildAdapterConfig({
      ...defaultCreateValues,
      adapterType,
      cwd,
      model:
        adapterType === "codex_local"
          ? model || DEFAULT_CODEX_LOCAL_MODEL
          : adapterType === "gemini_local"
            ? model || DEFAULT_GEMINI_LOCAL_MODEL
          : adapterType === "cursor"
          ? model || DEFAULT_CURSOR_LOCAL_MODEL
          : model,
      command,
      args,
      url,
      dangerouslySkipPermissions: adapterType === "claude_local",
      dangerouslyBypassSandbox:
        adapterType === "codex_local"
          ? DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX
          : defaultCreateValues.dangerouslyBypassSandbox
    });
    if (adapterType === "claude_local" && forceUnsetAnthropicApiKey) {
      const env =
        typeof config.env === "object" &&
        config.env !== null &&
        !Array.isArray(config.env)
          ? { ...(config.env as Record<string, unknown>) }
          : {};
      env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
      config.env = env;
    }
    return config;
  }

  async function runAdapterEnvironmentTest(
    adapterConfigOverride?: Record<string, unknown>
  ): Promise<AdapterEnvironmentTestResult | null> {
    if (!createdCompanyId) {
      setAdapterEnvError(
        "Create or select a fleet before testing adapter environment."
      );
      return null;
    }
    setAdapterEnvLoading(true);
    setAdapterEnvError(null);
    try {
      const result = await agentsApi.testEnvironment(
        createdCompanyId,
        adapterType,
        {
          adapterConfig: adapterConfigOverride ?? buildAdapterConfig()
        }
      );
      setAdapterEnvResult(result);
      return result;
    } catch (err) {
      setAdapterEnvError(
        err instanceof Error ? err.message : "Adapter environment test failed"
      );
      return null;
    } finally {
      setAdapterEnvLoading(false);
    }
  }

  async function handleStep1Next() {
    setLoading(true);
    setError(null);
    try {
      const company = await companiesApi.create({ name: companyName.trim() });
      setCreatedCompanyId(company.id);
      setCreatedCompanyPrefix(company.issuePrefix);
      setSelectedCompanyId(company.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });

      if (companyGoal.trim()) {
        const parsedGoal = parseOnboardingGoalInput(companyGoal);
        await goalsApi.create(company.id, {
          title: parsedGoal.title,
          ...(parsedGoal.description
            ? { description: parsedGoal.description }
            : {}),
          level: "company",
          status: "active"
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.goals.list(company.id)
        });
      }

      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create fleet");
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2Next() {
    if (!createdCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      if (adapterType === "opencode_local") {
        const selectedModelId = model.trim();
        if (!selectedModelId) {
          setError(
            "OpenCode requires an explicit model in provider/model format."
          );
          return;
        }
        if (adapterModelsError) {
          setError(
            adapterModelsError instanceof Error
              ? adapterModelsError.message
              : "Failed to load OpenCode models."
          );
          return;
        }
        if (adapterModelsLoading || adapterModelsFetching) {
          setError(
            "OpenCode models are still loading. Please wait and try again."
          );
          return;
        }
        const discoveredModels = adapterModels ?? [];
        if (!discoveredModels.some((entry) => entry.id === selectedModelId)) {
          setError(
            discoveredModels.length === 0
              ? "No OpenCode models discovered. Run `opencode models` and authenticate providers."
              : `Configured OpenCode model is unavailable: ${selectedModelId}`
          );
          return;
        }
      }

      if (isLocalAdapter) {
        const result = adapterEnvResult ?? (await runAdapterEnvironmentTest());
        if (!result) return;
      }

      const agent = await agentsApi.create(createdCompanyId, {
        name: agentName.trim(),
        role: "ceo",
        adapterType,
        adapterConfig: buildAdapterConfig(),
        runtimeConfig: {
          heartbeat: {
            enabled: true,
            intervalSec: 3600,
            wakeOnDemand: true,
            cooldownSec: 10,
            maxConcurrentRuns: 1
          }
        }
      });
      setCreatedAgentId(agent.id);
      queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(createdCompanyId)
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect bot");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnsetAnthropicApiKey() {
    if (!createdCompanyId || unsetAnthropicLoading) return;
    setUnsetAnthropicLoading(true);
    setError(null);
    setAdapterEnvError(null);
    setForceUnsetAnthropicApiKey(true);

    const configWithUnset = (() => {
      const config = buildAdapterConfig();
      const env =
        typeof config.env === "object" &&
        config.env !== null &&
        !Array.isArray(config.env)
          ? { ...(config.env as Record<string, unknown>) }
          : {};
      env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
      config.env = env;
      return config;
    })();

    try {
      if (createdAgentId) {
        await agentsApi.update(
          createdAgentId,
          { adapterConfig: configWithUnset },
          createdCompanyId
        );
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.list(createdCompanyId)
        });
      }

      const result = await runAdapterEnvironmentTest(configWithUnset);
      if (result?.status === "fail") {
        setError(
          "Retried with ANTHROPIC_API_KEY unset in adapter config, but the environment test is still failing."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to unset ANTHROPIC_API_KEY and retry."
      );
    } finally {
      setUnsetAnthropicLoading(false);
    }
  }

  async function handleStep3Next() {
    if (!createdCompanyId || !createdAgentId) return;
    setError(null);
    setStep(4);
  }

  async function handleLaunch() {
    if (!createdCompanyId || !createdAgentId) return;
    setLoading(true);
    setError(null);
    try {
      let issueRef = createdIssueRef;
      if (!issueRef) {
        const issue = await issuesApi.create(createdCompanyId, {
          title: taskTitle.trim(),
          ...(taskDescription.trim()
            ? { description: taskDescription.trim() }
            : {}),
          assigneeAgentId: createdAgentId,
          status: "todo"
        });
        issueRef = issue.identifier ?? issue.id;
        setCreatedIssueRef(issueRef);
        queryClient.invalidateQueries({
          queryKey: queryKeys.issues.list(createdCompanyId)
        });
      }

      setSelectedCompanyId(createdCompanyId);
      reset();
      closeOnboarding();
      navigate(
        createdCompanyPrefix
          ? `/${createdCompanyPrefix}/issues/${issueRef}`
          : `/issues/${issueRef}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (step === 1 && companyName.trim()) handleStep1Next();
      else if (step === 2 && agentName.trim()) handleStep2Next();
      else if (step === 3 && taskTitle.trim()) handleStep3Next();
      else if (step === 4) handleLaunch();
    }
  }

  if (!effectiveOnboardingOpen) return null;

  return (
    <Dialog
      open={effectiveOnboardingOpen}
      onOpenChange={(open) => {
        if (!open) {
          setRouteDismissed(true);
          handleClose();
        }
      }}
    >
      <DialogPortal>
        {/* Full-screen overlay with Fleet brand background */}
        <div className="fixed inset-0 z-50 bg-[#FAF9F6]" />
        <div className="fixed inset-0 z-50 flex" onKeyDown={handleKeyDown}>
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 left-4 z-10 rounded-sm p-1.5 text-[#948F8C] hover:text-[#2C2420] transition-colors"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </button>

          {/* Left half — form */}
          <div
            className={cn(
              "w-full flex flex-col overflow-y-auto transition-[width] duration-500 ease-in-out",
              step === 1 || step === 2 ? "md:w-1/2" : "md:w-full"
            )}
          >
            <div className={cn(
              "w-full mx-auto my-auto px-8 py-12 shrink-0",
              step === 3 ? "max-w-5xl" : "max-w-md"
            )}>
              {/* Fleet Onboarding Header */}
              <div className="flex items-center gap-2 mb-6">
                <span className="text-2xl">🦞</span>
                <span className="text-lg font-semibold text-[#2C2420]">Pain Point Fleet</span>
              </div>

              {/* Progress steps — 3-step Fleet flow */}
              <div className="flex items-center gap-0 mb-8 border-b border-[#E0E0E0]">
                {(
                  [
                    { step: 1 as Step, label: "Create Fleet", icon: Building2 },
                    { step: 2 as Step, label: "Select Roles", icon: Users },
                    { step: 3 as Step, label: "Connect Bots", icon: Bot },
                    { step: 4 as Step, label: "Launch", icon: Rocket }
                  ] as const
                ).map(({ step: s, label, icon: Icon }) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStep(s)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer",
                      s === step
                        ? "border-[#D4A373] text-[#2C2420]"
                        : "border-transparent text-[#948F8C] hover:text-[#2C2420]/70 hover:border-[#E0E0E0]"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Step content */}
              {step === 1 && (
                <div className="space-y-6">
                  {/* Step 1 hero */}
                  <div className="rounded-lg border border-[#D4A373]/30 bg-[#D4A373]/5 p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="rounded-lg bg-[#D4A373]/20 p-2.5">
                        <Building2 className="h-6 w-6 text-[#D4A373]" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[#2C2420]">Create your Fleet</h3>
                        <p className="text-xs text-[#948F8C]">
                          A Fleet is your AI bot team. Name it and set a mission.
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-[#2C2420]/60 leading-relaxed">
                      Your bots will work together under this fleet, with an org chart, roles, and shared goals.
                    </p>
                  </div>

                  {/* Fleet name input */}
                  <div className="group">
                    <label
                      className={cn(
                        "text-xs font-medium mb-1.5 block transition-colors",
                        companyName.trim()
                          ? "text-[#2C2420]"
                          : "text-[#948F8C] group-focus-within:text-[#2C2420]"
                      )}
                    >
                      Fleet Name
                    </label>
                    <input
                      className="w-full rounded-lg border border-[#E0E0E0] bg-white px-4 py-2.5 text-sm text-[#2C2420] outline-none focus:ring-2 focus:ring-[#D4A373]/40 focus:border-[#D4A373] placeholder:text-[#948F8C]/60 transition-all"
                      placeholder="e.g. Pain Point AI Fleet"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      autoFocus
                    />
                  </div>

                  {/* Mission input */}
                  <div className="group">
                    <label
                      className={cn(
                        "text-xs font-medium mb-1.5 block transition-colors",
                        companyGoal.trim()
                          ? "text-[#2C2420]"
                          : "text-[#948F8C] group-focus-within:text-[#2C2420]"
                      )}
                    >
                      Mission (optional)
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-[#E0E0E0] bg-white px-4 py-2.5 text-sm text-[#2C2420] outline-none focus:ring-2 focus:ring-[#D4A373]/40 focus:border-[#D4A373] placeholder:text-[#948F8C]/60 resize-none min-h-[80px] transition-all"
                      placeholder="What is this fleet trying to achieve?"
                      value={companyGoal}
                      onChange={(e) => setCompanyGoal(e.target.value)}
                    />
                  </div>

                  {/* Quick tips */}
                  <div className="flex items-start gap-2 rounded-md bg-[#F5F0EB] px-3 py-2.5">
                    <Sparkles className="h-3.5 w-3.5 text-[#D4A373] mt-0.5 shrink-0" />
                    <p className="text-[11px] text-[#2C2420]/70 leading-relaxed">
                      Next, you'll choose roles for your org chart and drag bots into positions.
                    </p>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-1">
                    <div className="rounded-lg bg-[#D4A373]/20 p-2">
                      <Users className="h-5 w-5 text-[#D4A373]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#2C2420]">Build your org chart</h3>
                      <p className="text-xs text-[#948F8C]">
                        Select roles for your fleet. The chart updates live.
                      </p>
                    </div>
                  </div>

                  {/* Role categories */}
                  <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                    {(
                      Object.entries(FLEET_ROLES) as [RoleCategory, FleetRole[]][]
                    ).map(([category, roles]) => (
                      <div key={category}>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-[11px] font-semibold text-[#2C2420] uppercase tracking-wider mb-1.5 w-full"
                          onClick={() => {
                            const allIds = roles.map((r) => r.id);
                            const allSelected = allIds.every((id) =>
                              selectedRoles.includes(id)
                            );
                            if (allSelected) {
                              setSelectedRoles((prev) =>
                                prev.filter((id) => !allIds.includes(id))
                              );
                            } else {
                              setSelectedRoles((prev) => [
                                ...prev,
                                ...allIds.filter((id) => !prev.includes(id)),
                              ]);
                            }
                          }}
                        >
                          {ROLE_CATEGORIES[category].label}
                          <span className="text-[#948F8C] font-normal">
                            {ROLE_CATEGORIES[category].labelZh}
                          </span>
                          <span className="text-[#948F8C] font-normal ml-auto text-[10px]">
                            {roles.filter((r) => selectedRoles.includes(r.id)).length}/{roles.length}
                          </span>
                        </button>
                        <div className="grid grid-cols-2 gap-1">
                          {roles.map((role) => {
                            const checked = selectedRoles.includes(role.id);
                            return (
                              <label
                                key={role.id}
                                className={cn(
                                  "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs cursor-pointer transition-all",
                                  checked
                                    ? "border-[#D4A373] bg-[#D4A373]/10"
                                    : "border-[#E0E0E0] hover:border-[#D4A373]/40"
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleRole(role.id)}
                                  className="sr-only"
                                />
                                <span className="text-sm leading-none shrink-0">
                                  {role.defaultEmoji}
                                </span>
                                <div className="min-w-0">
                                  <span className="font-medium text-[#2C2420] text-[11px] block truncate">
                                    {role.title}
                                  </span>
                                  <span className="text-[9px] text-[#948F8C] block truncate">
                                    {role.subtitle}
                                  </span>
                                </div>
                                {checked && (
                                  <Check className="h-3 w-3 text-[#D4A373] shrink-0 ml-auto" />
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Add custom role */}
                    <div>
                      <p className="text-[11px] font-semibold text-[#2C2420] uppercase tracking-wider mb-1.5">
                        Custom Role
                      </p>
                      <div className="flex gap-1.5">
                        <input
                          className="flex-1 rounded-md border border-[#E0E0E0] bg-white px-2.5 py-1.5 text-xs text-[#2C2420] outline-none focus:ring-1 focus:ring-[#D4A373]/40 focus:border-[#D4A373] placeholder:text-[#948F8C]/60"
                          placeholder="e.g. AI Trainer"
                          value={customRoleTitle}
                          onChange={(e) => setCustomRoleTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && customRoleTitle.trim()) {
                              e.preventDefault();
                              const id = `custom-${customRoleTitle
                                .trim()
                                .toLowerCase()
                                .replace(/\s+/g, "-")}-${Date.now()}`;
                              setSelectedRoles((prev) => [...prev, id]);
                              setCustomRoleTitle("");
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs border-[#E0E0E0]"
                          disabled={!customRoleTitle.trim()}
                          onClick={() => {
                            const id = `custom-${customRoleTitle
                              .trim()
                              .toLowerCase()
                              .replace(/\s+/g, "-")}-${Date.now()}`;
                            setSelectedRoles((prev) => [...prev, id]);
                            setCustomRoleTitle("");
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Selection summary */}
                  <div className="flex items-start gap-2 rounded-md bg-[#F5F0EB] px-3 py-2">
                    <Sparkles className="h-3.5 w-3.5 text-[#D4A373] mt-0.5 shrink-0" />
                    <p className="text-[11px] text-[#2C2420]/70 leading-relaxed">
                      {selectedRoles.length} role{selectedRoles.length !== 1 ? "s" : ""} selected.
                      Empty positions will show as vacant slots you can fill later.
                    </p>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="rounded-lg bg-[#D4A373]/20 p-2">
                      <Bot className="h-5 w-5 text-[#D4A373]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#2C2420]">Connect your Bots</h3>
                      <p className="text-xs text-[#948F8C]">
                        Drag detected bots into org chart positions.
                        Empty slots can be filled later.
                      </p>
                    </div>
                  </div>

                  <BotConnectStep
                    selectedRoles={selectedRoles}
                    assignments={assignments}
                    onAssignmentsChange={setAssignments}
                    companyId={createdCompanyId}
                  />

                  <div className="flex items-start gap-2 rounded-md bg-[#F5F0EB] px-3 py-2.5">
                    <Sparkles className="h-3.5 w-3.5 text-[#D4A373] mt-0.5 shrink-0" />
                    <p className="text-[11px] text-[#2C2420]/70 leading-relaxed">
                      You can skip this step and connect bots later from the Dashboard.
                    </p>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="rounded-lg bg-[#D4A373]/20 p-2">
                      <Rocket className="h-5 w-5 text-[#D4A373]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#2C2420]">Ready to launch</h3>
                      <p className="text-xs text-[#948F8C]">
                        Your fleet is configured. Launch to enter the Dashboard.
                      </p>
                    </div>
                  </div>
                  <div className="border border-[#E0E0E0] rounded-lg divide-y divide-[#E0E0E0]">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Building2 className="h-4 w-4 text-[#D4A373] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#2C2420] truncate">
                          {companyName}
                        </p>
                        <p className="text-xs text-[#948F8C]">Fleet</p>
                      </div>
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Users className="h-4 w-4 text-[#D4A373] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#2C2420] truncate">
                          {selectedRoles.length} Role{selectedRoles.length !== 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-[#948F8C]">Org Chart</p>
                      </div>
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Bot className="h-4 w-4 text-[#D4A373] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#2C2420] truncate">
                          {assignments.length} Bot{assignments.length !== 1 ? "s" : ""} Connected
                        </p>
                        <p className="text-xs text-[#948F8C]">
                          {assignments.length > 0
                            ? assignments.map((a) => a.bot.name).join(", ")
                            : "Connect from Dashboard"}
                        </p>
                      </div>
                      {assignments.length > 0 ? (
                        <Check className="h-4 w-4 text-green-500 shrink-0" />
                      ) : (
                        <span className="text-[10px] text-[#948F8C] shrink-0">Later</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}

              {/* Footer navigation */}
              <div className="flex items-center justify-between mt-8">
                <div>
                  {step > 1 && step > (onboardingOptions.initialStep ?? 1) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep((step - 1) as Step)}
                      disabled={loading}
                    >
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                      Back
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {step === 1 && (
                    <Button
                      size="sm"
                      disabled={!companyName.trim() || loading}
                      onClick={handleStep1Next}
                      className="bg-[#D4A373] text-white hover:bg-[#B08968] border-none"
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Creating Fleet..." : "Next: Select Roles"}
                    </Button>
                  )}
                  {step === 2 && (
                    <Button
                      size="sm"
                      disabled={selectedRoles.length === 0}
                      onClick={handleStep2RolesNext}
                      className="bg-[#D4A373] text-white hover:bg-[#B08968] border-none"
                    >
                      <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      Next: Connect Bots
                    </Button>
                  )}
                  {step === 3 && (
                    <Button
                      size="sm"
                      onClick={() => setStep(4)}
                      className="bg-[#D4A373] text-white hover:bg-[#B08968] border-none"
                    >
                      <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      Next: Review & Launch
                    </Button>
                  )}
                  {step === 4 && (
                    <Button
                      size="sm"
                      disabled={loading}
                      onClick={handleLaunch}
                      className="bg-[#D4A373] text-white hover:bg-[#B08968] border-none"
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Rocket className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Launching..." : "Launch Fleet! 🚀"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right half — brand illustration (step 1), org chart preview (step 2) */}
          <div
            className={cn(
              "hidden md:flex flex-col items-center justify-center overflow-hidden bg-[#2C2420] transition-[width,opacity] duration-500 ease-in-out",
              step === 1 || step === 2
                ? "w-1/2 opacity-100"
                : "w-0 opacity-0"
            )}
          >
            {step === 1 && (
              <div className="text-center px-8 max-w-sm">
                <div className="text-7xl mb-6">🦞</div>
                <h2 className="text-2xl font-bold text-[#D4A373] mb-3">
                  Pain Point Fleet
                </h2>
                <p className="text-sm text-[#FAF9F6]/70 leading-relaxed mb-6">
                  Manage your AI bot army. Connect OpenClaw bots, assign roles,
                  and monitor everything from one dashboard.
                </p>
                <div className="flex items-center justify-center gap-4 text-xs text-[#FAF9F6]/50">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[#27BD74]" />
                    <span>Org Chart</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[#D4A373]" />
                    <span>Drag & Drop</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[#2A9D8F]" />
                    <span>Auto-Detect</span>
                  </div>
                </div>
              </div>
            )}
            {step === 2 && (
              <OrgChartPreview selectedRoles={selectedRoles} />
            )}
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}

function AdapterEnvironmentResult({
  result
}: {
  result: AdapterEnvironmentTestResult;
}) {
  const statusLabel =
    result.status === "pass"
      ? "Passed"
      : result.status === "warn"
      ? "Warnings"
      : "Failed";
  const statusClass =
    result.status === "pass"
      ? "text-green-700 dark:text-green-300 border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/10"
      : result.status === "warn"
      ? "text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10"
      : "text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10";

  return (
    <div className={`rounded-md border px-2.5 py-2 text-[11px] ${statusClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{statusLabel}</span>
        <span className="opacity-80">
          {new Date(result.testedAt).toLocaleTimeString()}
        </span>
      </div>
      <div className="mt-1.5 space-y-1">
        {result.checks.map((check, idx) => (
          <div
            key={`${check.code}-${idx}`}
            className="leading-relaxed break-words"
          >
            <span className="font-medium uppercase tracking-wide opacity-80">
              {check.level}
            </span>
            <span className="mx-1 opacity-60">·</span>
            <span>{check.message}</span>
            {check.detail && (
              <span className="block opacity-75 break-all">
                ({check.detail})
              </span>
            )}
            {check.hint && (
              <span className="block opacity-90 break-words">
                Hint: {check.hint}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Org Chart Preview — live visualization of selected roles
// ---------------------------------------------------------------------------

function OrgChartPreview({ selectedRoles }: { selectedRoles: string[] }) {
  const tree = buildOrgTree(selectedRoles);

  if (selectedRoles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="text-5xl mb-4 opacity-30">🦞</div>
        <p className="text-sm text-[#FAF9F6]/50">
          Select roles to preview your org chart
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full overflow-auto p-6">
      <h3 className="text-xs font-semibold text-[#D4A373] mb-6 uppercase tracking-wider">
        Org Chart Preview
      </h3>
      <div className="inline-flex flex-col items-center scale-90 origin-top">
        {tree.map((node) => (
          <OrgNodeView key={node.role.id} node={node} isRoot />
        ))}
      </div>
      <p className="text-[10px] text-[#FAF9F6]/30 mt-6">
        {selectedRoles.length} role{selectedRoles.length !== 1 ? "s" : ""}{" "}
        selected — empty slots show "Drag bot here"
      </p>
    </div>
  );
}

function OrgNodeView({
  node,
  isRoot = false,
}: {
  node: OrgChartNode;
  isRoot?: boolean;
}) {
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* Node card */}
      <div
        className={cn(
          "rounded-lg border-2 border-dashed px-3 py-1.5 text-center min-w-[72px]",
          node.botId
            ? "border-[#27BD74]/60 bg-[#27BD74]/10"
            : "border-[#D4A373]/40 bg-[#FAF9F6]/5"
        )}
      >
        <div className="text-base leading-none">
          {node.role.defaultEmoji ?? "\uD83D\uDC64"}
        </div>
        <div className="text-[9px] font-semibold text-[#FAF9F6] mt-1 whitespace-nowrap">
          {node.role.title}
        </div>
        <div className="text-[7px] text-[#FAF9F6]/40 whitespace-nowrap">
          {node.role.subtitle}
        </div>
      </div>

      {hasChildren && (
        <>
          {/* Vertical line from parent down to junction */}
          <div className="w-px h-4 bg-[#D4A373]/30" />

          {/* Children row with horizontal connectors */}
          <div className="relative flex gap-1">
            {node.children.map((child, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === node.children.length - 1;
              const isOnly = node.children.length === 1;

              return (
                <div
                  key={child.role.id}
                  className="flex flex-col items-center"
                >
                  {/* Horizontal bar segment + vertical connector to child */}
                  <div className="relative w-full h-4">
                    {/* Left half of horizontal bar */}
                    {!isFirst && !isOnly && (
                      <div className="absolute top-0 left-0 w-1/2 border-t border-[#D4A373]/30" />
                    )}
                    {/* Right half of horizontal bar */}
                    {!isLast && !isOnly && (
                      <div className="absolute top-0 right-0 w-1/2 border-t border-[#D4A373]/30" />
                    )}
                    {/* Vertical line down to child */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-[#D4A373]/30" />
                  </div>
                  <OrgNodeView node={child} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
