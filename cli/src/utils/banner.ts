import pc from "picocolors";

const FLEET_ART = [
  "███████╗██╗     ███████╗███████╗████████╗",
  "██╔════╝██║     ██╔════╝██╔════╝╚══██╔══╝",
  "█████╗  ██║     █████╗  █████╗     ██║   ",
  "██╔══╝  ██║     ██╔══╝  ██╔══╝     ██║   ",
  "██║     ███████╗███████╗███████╗   ██║   ",
  "╚═╝     ╚══════╝╚══════╝╚══════╝   ╚═╝   ",
] as const;

const TAGLINE = "Open-source orchestration for zero-human companies";

export function printFleetCliBanner(): void {
  const lines = [
    "",
    ...FLEET_ART.map((line) => pc.cyan(line)),
    pc.blue("  ───────────────────────────────────────────────────────"),
    pc.bold(pc.white(`  ${TAGLINE}`)),
    "",
  ];

  console.log(lines.join("\n"));
}
