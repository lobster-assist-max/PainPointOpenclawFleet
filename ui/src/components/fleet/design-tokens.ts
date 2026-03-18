/**
 * Fleet Design Tokens — Glassmorphism + Pain Point brand styles.
 *
 * Based on painpoint-ai.com's visual language:
 * - Warm earthy tones (gold, espresso, cream)
 * - Glassmorphism cards (backdrop-blur + semi-transparent)
 * - Teal accent for informational elements
 * - LINE green for channel-specific UI
 * - Floating ambient animations
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
    "backdrop-blur-md",
    "rounded-2xl",
    "border",
    "border-[#E0E0E0]/50",
    "shadow-sm",
    "transition-all",
    "duration-300",
  ].join(" "),

  /** Elevated card — Dashboard top stats, important sections */
  elevated: [
    "bg-[#FAF9F6]/95",
    "backdrop-blur-xl",
    "rounded-2xl",
    "border",
    "border-[#D4A373]/20",
    "shadow-lg",
    "transition-all",
    "duration-300",
  ].join(" "),

  /** Dark card — Footer, Header areas */
  dark: [
    "bg-gradient-to-r",
    "from-[#2C2420]",
    "to-[#3D3530]",
    "text-[#FAF9F6]",
    "rounded-2xl",
  ].join(" "),

  /** Alert card — left-border accent for alerts */
  alert: [
    "bg-[#FAF9F6]/95",
    "backdrop-blur-md",
    "rounded-2xl",
    "border-l-4",
    "shadow-sm",
  ].join(" "),

  /** Interactive card — hover effects for clickable cards */
  interactive: [
    "bg-[#FAF9F6]/90",
    "backdrop-blur-md",
    "rounded-2xl",
    "border",
    "border-[#E0E0E0]/50",
    "shadow-sm",
    "transition-all",
    "duration-300",
    "hover:-translate-y-1",
    "hover:shadow-xl",
    "hover:border-[#D4A373]/30",
    "hover:shadow-[#D4A373]/10",
    "cursor-pointer",
  ].join(" "),
} as const;

// ─── Teal Info Styles ───────────────────────────────────────────────────────

export const fleetInfoStyles = {
  /** Info badge — for tags, labels, metadata */
  badge: "bg-[#E0F2F1] text-[#264653] text-xs font-medium px-2 py-0.5 rounded-full",
  /** Info link */
  link: "text-[#2A9D8F] hover:text-[#264653] transition-colors duration-200",
  /** Info tooltip */
  tooltip: "bg-[#264653] text-[#FAF9F6] text-xs px-2 py-1 rounded shadow-lg",
  /** Info text */
  text: "text-[#264653]",
  /** Info background */
  bg: "bg-[#E0F2F1]",
} as const;

// ─── LINE Channel Styles ────────────────────────────────────────────────────

export const lineStyles = {
  badge: "bg-[#00B900] text-white text-xs font-medium px-2 py-0.5 rounded-full",
  button:
    "bg-[#00B900] hover:bg-[#00A000] text-white font-medium px-4 py-2 rounded-lg transition-colors duration-200",
  dot: "w-2 h-2 rounded-full bg-[#00B900]",
} as const;

// ─── Channel Brand Colors ───────────────────────────────────────────────────

export const channelColors: Record<string, { bg: string; text: string; dot: string }> = {
  line: { bg: "bg-[#00B900]/10", text: "text-[#00B900]", dot: "bg-[#00B900]" },
  telegram: { bg: "bg-[#26A5E4]/10", text: "text-[#26A5E4]", dot: "bg-[#26A5E4]" },
  discord: { bg: "bg-[#5865F2]/10", text: "text-[#5865F2]", dot: "bg-[#5865F2]" },
  whatsapp: { bg: "bg-[#25D366]/10", text: "text-[#25D366]", dot: "bg-[#25D366]" },
  slack: { bg: "bg-[#4A154B]/10", text: "text-[#4A154B]", dot: "bg-[#4A154B]" },
  signal: { bg: "bg-[#3A76F0]/10", text: "text-[#3A76F0]", dot: "bg-[#3A76F0]" },
  msteams: { bg: "bg-[#6264A7]/10", text: "text-[#6264A7]", dot: "bg-[#6264A7]" },
} as const;

// ─── Severity Colors ────────────────────────────────────────────────────────

export const severityColors = {
  critical: {
    border: "border-red-500",
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
  warning: {
    border: "border-[#D4A373]",
    bg: "bg-[#D4A373]/10",
    text: "text-[#9A7B5B]",
    dot: "bg-[#D4A373]",
  },
  info: {
    border: "border-[#2A9D8F]",
    bg: "bg-[#E0F2F1]",
    text: "text-[#264653]",
    dot: "bg-[#2A9D8F]",
  },
} as const;

// ─── Impact Level Colors (for Blast Radius) ────────────────────────────────

export const impactColors = {
  critical: "text-red-600 bg-red-100",
  high: "text-orange-600 bg-orange-100",
  medium: "text-amber-600 bg-amber-100",
  low: "text-[#264653] bg-[#E0F2F1]",
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

// ─── Animation Presets ──────────────────────────────────────────────────────

export const animations = {
  /** Slow floating for ambient background elements */
  float8s: { animation: "float 8s ease-in-out infinite" },
  float10s: { animation: "float 10s ease-in-out infinite" },
  float15s: { animation: "float 15s ease-in-out infinite 1s" },
  /** Slow pulse for ambient glow */
  pulse8s: { animation: "pulse 8s ease-in-out infinite" },
  pulse12s: { animation: "pulse 12s ease-in-out infinite 2s" },
} as const;

// ─── CSS Keyframes (inject once in global CSS) ──────────────────────────────

export const keyframesCSS = `
@keyframes float {
  0%, 100% { transform: translateY(0) translateX(0); }
  25% { transform: translateY(-20px) translateX(10px); }
  50% { transform: translateY(-10px) translateX(-5px); }
  75% { transform: translateY(-25px) translateX(15px); }
}
`;
