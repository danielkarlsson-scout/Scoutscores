export type ScoutSection = "sparare" | "upptackare" | "aventyrare" | "utmanare";

export const SCOUT_SECTIONS: Record<ScoutSection, { name: string; ageRange: string }> = {
  sparare: { name: "Spårare", ageRange: "8-9 år" },
  upptackare: { name: "Upptäckare", ageRange: "10-11 år" },
  aventyrare: { name: "Äventyrare", ageRange: "12-14 år" },
  utmanare: { name: "Utmanare", ageRange: "15-17 år" },
  rover: : { name: "Rover", ageRange: "18-25 år" },
};

export type CompetitionStatus = "active" | "closed";

export interface ScoutGroup {
  id: string;
  name: string;
  createdAt: string;
}

/**
 * App-modell (vad UI använder)
 */
export interface ScoutGroupTemplate {
  id: string;
  name: string;
  groups: string[]; // gruppnamn (lagras som text[] eller jsonb i DB)
  createdAt: string;
  createdBy?: string; // valfritt men bra när templates ligger i DB
}

/**
 * DB-row-typer (vad Supabase brukar returnera)
 * Använd dessa i mapping i CompetitionContext så du inte blandar created_at/createdAt.
 */
export type ScoutGroupRow = {
  id: string;
  name: string;
  competition_id: string;
  created_at: string;
};

export type ScoutGroupTemplateRow = {
  id: string;
  name: string;
  groups: string[]; // text[] eller jsonb -> array
  created_at: string;
  created_by?: string | null;
};

export interface Station {
  id: string;
  name: string;
  description: string;
  maxScore: number;
  leaderEmail?: string;
  allowedSections?: ScoutSection[];
  createdAt: string;
}

export interface Patrol {
  id: string;
  name: string;
  section: ScoutSection;
  scoutGroupId?: string;
  members?: number;
  createdAt: string;
}

export interface Score {
  id: string;
  patrolId: string;
  stationId: string;
  score: number;
  updatedAt: string;
}

/**
 * Viktigt: i DB verkar date kunna vara null.
 * Gör den nullable så slipper du “type mismatch” när du läser från Supabase.
 */
export interface Competition {
  id: string;
  name: string;
  date: string | null;
  status: CompetitionStatus;
  stations: Station[];
  patrols: Patrol[];
  scores: Score[];
  scoutGroups: ScoutGroup[];
  createdAt: string;
  closedAt?: string;
}

export interface PatrolWithScore extends Patrol {
  totalScore: number;
  stationScores: Record<string, number>;
  rank?: number;
}
