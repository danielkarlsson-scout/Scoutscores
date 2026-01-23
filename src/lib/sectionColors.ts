import type { ScoutSection } from "@/types/competition";

export const SECTION_LABEL: Record<ScoutSection, string> = {
  sparare: "Spårare",
  upptackare: "Upptäckare",
  aventyrare: "Äventyrare",
  utmanare: "Utmanare",
};

export const SECTION_BADGE_CLASS: Record<ScoutSection, string> = {
  // ✅ önskade färger
  aventyrare: "bg-orange-100 text-orange-800 border-orange-200",
  utmanare: "bg-pink-100 text-pink-800 border-pink-200",
  upptackare: "bg-sky-100 text-sky-800 border-sky-200",
  sparare: "bg-green-100 text-green-800 border-green-200",
};
