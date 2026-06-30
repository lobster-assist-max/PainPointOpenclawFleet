import { MemoryMeshEngine, type RawBotMemory } from "./fleet-memory-mesh.js";
import { getFleetMonitorService } from "./fleet-monitor.js";
import { getFleetBotWorkshopService } from "./fleet-bot-workshop.js";

let instance: MemoryMeshEngine | null = null;

/** Strip a leading `---\n...\n---` YAML frontmatter block from a memory file. */
function stripFrontmatter(content: string): string {
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "").trim();
}

/**
 * Map a bot's curated memory `.md` type onto the mesh engine's source enum.
 * Reference docs are system-curated; everything else is human/manual.
 */
function mapSource(type: string): RawBotMemory["source"] {
  switch (type) {
    case "reference":
      return "system";
    case "feedback":
    case "project":
    case "user":
    default:
      return "manual";
  }
}

export function getMemoryMeshEngine(): MemoryMeshEngine {
  if (!instance) {
    const monitor = getFleetMonitorService();
    instance = new MemoryMeshEngine({
      getBots: () =>
        monitor.getAllBots().map((b) => ({
          id: b.botId,
          name: b.botId,
          gatewayUrl: b.gatewayUrl ?? "",
        })),
      // Read each bot's curated memory files over the gateway RPC, reusing the
      // same proven path the Bot Workshop uses (agents.files.list "memory/" +
      // agents.files.get, frontmatter-parsed). The body text feeds the mesh's
      // topic/conflict/knowledge-graph analysis, so frontmatter is stripped and
      // the name/description are folded in to weight the salient keywords.
      readBotMemories: async (botId: string): Promise<RawBotMemory[]> => {
        const workshop = getFleetBotWorkshopService();
        const memories = await workshop.listMemories(botId);
        return memories.map((m) => {
          const body = stripFrontmatter(m.content);
          const parts = [m.name, m.description, body].filter(
            (p): p is string => Boolean(p && p.trim()),
          );
          return {
            content: parts.join(". "),
            tags: [m.type, m.name].filter(
              (t): t is string => Boolean(t && t !== "unknown"),
            ),
            source: mapSource(m.type),
          };
        });
      },
    });
  }
  return instance;
}

export function disposeMemoryMeshEngine(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
