export type ScoutSection = 'sparare' | 'upptackare' | 'aventyrare' | 'utmanare';

export const SCOUT_SECTIONS: Record<ScoutSection, { name: string; ageRange: string }> = {
  sparare: { name: 'Spårare', ageRange: '8-9 år' },
  upptackare: { name: 'Upptäckare', ageRange: '10-11 år' },
  aventyrare: { name: 'Äventyrare', ageRange: '12-14 år' },
  utmanare: { name: 'Utmanare', ageRange: '15-17 år' },
};

export type CompetitionStatus = 'active' | 'closed';

export interface ScoutGroup {
  id: string;
  name: string;
  createdAt: string;
}

export interface ScoutGroupTemplate {
  id: string;
  name: string;
  groups: string[]; // List of group names
  createdAt: string;
}

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

export interface Competition {
  id: string;
  name: string;
  date: string;
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
