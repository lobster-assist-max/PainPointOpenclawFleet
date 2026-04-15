/**
 * Fleet Design Tokens — Glassmorphism + Pain Point brand styles.
 *
 * Based on painpoint-ai.com's visual language:
 * - Warm earthy tones (gold, espresso, cream)
 * - Glassmorphism cards (backdrop-blur + semi-transparent)
 * - Teal accent for informational elements
 * - LINE green for channel-specific UI
 */

// ─── Brand Colors ───────────────────────────────────────────────────────────

export const brandColors = {
  /** Primary accent — warm gold/caramel */
  primary: "#D4A373",
  /** Secondary — muted warm tan */
  secondary: "#B08968",
  /** Tertiary — deeper olive-tan (hover state) */
  tertiary: "#9A7B5B",
  /** Background — off-white cream */
  background: "#FAF9F6",
  /** Foreground — deep espresso brown */
  foreground: "#2C2420",
  /** Dark variant — lighter espresso */
  darkVariant: "#3D3530",
  /** Border — light gray */
  border: "#E0E0E0",
  /** Light alt — warm beige */
  lightAlt: "#F5F0EB",
  /** Warm light gray */
  warmGray: "#E8E4DF",
  /** Teal dark — informational text */
  tealDark: "#264653",
  /** Teal medium — informational accent */
  tealMedium: "#2A9D8F",
  /** Teal light — informational background */
  tealLight: "#E0F2F1",
  /** LINE green — CTA */
  lineGreen: "#00B900",
  /** LINE green hover */
  lineGreenHover: "#00A000",
} as const;

// ─── Card Styles (Glassmorphism) ────────────────────────────────────────────

export const fleetCardStyles = {
  /** Standard card — replaces bg-white border shadow-sm */
  default: [
    "bg-[#FAF9F6]/90",
    "dark:bg-stone-900/90",
    "backdrop-blur-md",
    "rounded-2xl",
    "border",
    "border-[#E0E0E0]/50",
    "dark:border-stone-700/50",
    "shadow-sm",
    "transition-all",
    "duration-300",
  ].join(" "),

  /** Elevated card — Dashboard top stats, important sections */
  elevated: [
    "bg-[#FAF9F6]/95",
    "dark:bg-stone-900/95",
    "backdrop-blur-xl",
    "rounded-2xl",
    "border",
    "border-[#D4A373]/20",
    "dark:border-[#C4956A]/20",
    "shadow-lg",
    "transition-all",
    "duration-300",
  ].join(" "),

  /** Dark card — Footer, Header areas */
  dark: [
    "bg-gradient-to-r",
    "from-[#2C2420]",
    "to-[#3D3530]",
    "dark:from-stone-950",
    "dark:to-stone-900",
    "text-[#FAF9F6]",
    "dark:text-stone-100",
    "rounded-2xl",
  ].join(" "),

  /** Alert card — left-border accent for alerts */
  alert: [
    "bg-[#FAF9F6]/95",
    "dark:bg-stone-900/95",
    "backdrop-blur-md",
    "rounded-2xl",
    "border-l-4",
    "shadow-sm",
  ].join(" "),

  /** Interactive card — hover effects for clickable cards */
  interactive: [
    "bg-[#FAF9F6]/90",
    "dark:bg-stone-900/90",
    "backdrop-blur-md",
    "rounded-2xl",
    "border",
    "border-[#E0E0E0]/50",
    "dark:border-stone-700/50",
    "shadow-sm",
    "transition-all",
    "duration-300",
    "hover:-translate-y-1",
    "hover:shadow-xl",
    "hover:border-[#D4A373]/30",
    "dark:hover:border-[#C4956A]/30",
    "hover:shadow-[#D4A373]/10",
    "cursor-pointer",
  ].join(" "),
} as const;

// ─── Teal Info Styles ───────────────────────────────────────────────────────

export const fleetInfoStyles = {
  /** Info badge — for tags, labels, metadata */
  badge: "bg-[#E0F2F1] dark:bg-teal-950/40 text-[#264653] dark:text-teal-300 text-xs font-medium px-2 py-0.5 rounded-full",
  /** Info link */
  link: "text-[#2A9D8F] dark:text-teal-400 hover:text-[#264653] dark:hover:text-teal-200 transition-colors duration-200",
  /** Info tooltip */
  tooltip: "bg-[#264653] dark:bg-stone-800 text-[#FAF9F6] dark:text-stone-100 text-xs px-2 py-1 rounded shadow-lg",
  /** Info text */
  text: "text-[#264653] dark:text-teal-300",
  /** Info background */
  bg: "bg-[#E0F2F1] dark:bg-teal-950/30",
} as const;

// ─── Channel Brand Colors ───────────────────────────────────────────────────

export const channelColors: Record<string, { bg: string; text: string; dot: string }> = {
  line: { bg: "bg-[#00B900]/10 dark:bg-[#00B900]/20", text: "text-[#00B900] dark:text-[#4ADE80]", dot: "bg-[#00B900] dark:bg-[#4ADE80]" },
  telegram: { bg: "bg-[#26A5E4]/10 dark:bg-[#26A5E4]/20", text: "text-[#26A5E4] dark:text-[#7DD3FC]", dot: "bg-[#26A5E4] dark:bg-[#7DD3FC]" },
  discord: { bg: "bg-[#5865F2]/10 dark:bg-[#5865F2]/20", text: "text-[#5865F2] dark:text-[#A5B4FC]", dot: "bg-[#5865F2] dark:bg-[#A5B4FC]" },
  whatsapp: { bg: "bg-[#25D366]/10 dark:bg-[#25D366]/20", text: "text-[#25D366] dark:text-[#6EE7B7]", dot: "bg-[#25D366] dark:bg-[#6EE7B7]" },
  slack: { bg: "bg-[#4A154B]/10 dark:bg-[#E8D5E0]/10", text: "text-[#4A154B] dark:text-[#E8D5E0]", dot: "bg-[#4A154B] dark:bg-[#E8D5E0]" },
  signal: { bg: "bg-[#3A76F0]/10 dark:bg-[#3A76F0]/20", text: "text-[#3A76F0] dark:text-[#93C5FD]", dot: "bg-[#3A76F0] dark:bg-[#93C5FD]" },
  msteams: { bg: "bg-[#6264A7]/10 dark:bg-[#6264A7]/20", text: "text-[#6264A7] dark:text-[#C4B5FD]", dot: "bg-[#6264A7] dark:bg-[#C4B5FD]" },
  web: { bg: "bg-primary/10", text: "text-primary", dot: "bg-primary" },
} as const;

// ─── Severity Colors ────────────────────────────────────────────────────────

export const severityColors = {
  critical: {
    border: "border-red-500",
    bg: "bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
  warning: {
    border: "border-[#D4A373]",
    bg: "bg-[#D4A373]/10 dark:bg-amber-950/30",
    text: "text-[#9A7B5B] dark:text-amber-400",
    dot: "bg-[#D4A373]",
  },
  info: {
    border: "border-[#2A9D8F]",
    bg: "bg-[#E0F2F1] dark:bg-teal-950/30",
    text: "text-[#264653] dark:text-teal-300",
    dot: "bg-[#2A9D8F]",
  },
} as const;

// ─── Gradient Presets ───────────────────────────────────────────────────────

export const gradients = {
  /** Primary CTA gradient */
  primary: "bg-gradient-to-r from-[#D4A373] to-[#B08968]",
  primaryHover: "hover:from-[#B08968] hover:to-[#9A7B5B]",
  /** Dark panel gradient */
  dark: "bg-gradient-to-r from-[#2C2420] to-[#3D3530]",
  /** Subtle background gradient */
  subtle: "bg-gradient-to-b from-[#FAF9F6] to-[#F5F0EB]",
  /** Warm cream gradient */
  cream: "bg-gradient-to-r from-[#FAF9F6] to-[#E8E4DF]",
} as const;

