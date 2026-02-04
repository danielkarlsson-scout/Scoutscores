import { ScoutSection, SCOUT_SECTIONS } from "@/types/competition";
import { cn } from "@/lib/utils";

interface SectionBadgeProps {
  // ✅ gör komponenten robust mot null/okända värden
  section: ScoutSection | string | null | undefined;
  className?: string;
  size?: "sm" | "md" | "lg";
}

// Håll originalfärgerna för kända sektioner
const sectionColors: Partial<Record<ScoutSection, string>> = {
  sparare: "bg-[hsl(109,60%,41%)] text-white",
  upptackare: "bg-[hsl(195,100%,44%)] text-white",
  aventyrare: "bg-[hsl(21,85%,49%)] text-white",
  utmanare: "bg-[hsl(334,100%,43%)] text-white",
  rover: "bg-[hsl(59,100%,44%)] text-white",
};

const sizeClasses = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-3 py-1 text-sm",
  lg: "px-4 py-1.5 text-base",
};

function isKnownSection(value: any): value is ScoutSection {
  return !!value && typeof value === "string" && value in SCOUT_SECTIONS;
}

export function SectionBadge({ section, className, size = "md" }: SectionBadgeProps) {
  const known = isKnownSection(section);

  const label = known
    ? SCOUT_SECTIONS[section].name
    : section
      ? String(section)
      : "Okänd";

  const colorClass = known
    ? sectionColors[section]
    : "bg-muted text-foreground border border-border";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        colorClass,
        sizeClasses[size],
        className
      )}
      title={!known ? "Okänd/ogiltig avdelning i data" : undefined}
    >
      {label}
    </span>
  );
}
