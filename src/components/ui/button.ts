// Shared by <button> and <Link>, so links styled as buttons look identical.
const base =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants = {
  primary: "bg-accent text-accent-foreground hover:opacity-90",
  secondary: "border border-border bg-surface hover:bg-background",
  danger: "border border-danger text-danger hover:bg-danger-soft",
} as const;

export function buttonClasses(variant: keyof typeof variants = "primary", extra = ""): string {
  return `${base} ${variants[variant]} ${extra}`.trim();
}
