import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Competition,
  CompetitionStatus,
  Patrol,
  PatrolWithScore,
  Score,
  ScoutGroup,
  ScoutGroupTemplate,
  ScoutSection,
  Station,
} from "@/types/competition";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type SaveState = "idle" | "saving" | "saved" | "error";

interface CompetitionContextType {
  competitions: Competition[];
  activeCompetitions: Competition[];
  archivedCompetitions: Competition[];

  competition: Competition | null;
  stations: Station[];
  patrols: Patrol[];
  scores: Score[];
  scoutGroups: ScoutGroup[];

  scoutGroupTemplates: ScoutGroupTemplate[];

  createCompetition: (data: { name: string; date: string }) => Promise<Competition>;
  selectCompetition: (id: string) => void;
  closeCompetition: (id: string) => Promise<void>;
  reopenCompetition: (id: string) => Promise<void>;
  deleteCompetition: (id: string) => Promise<void>;
  updateCompetitionById: (id: string, updates: Partial<Competition>) => void;

  addStation: (station: Omit<Station, "id" | "createdAt">) => Promise<void>;
  updateStation: (id: string, updates: Partial<Station>) => Promise<void>;
  deleteStation: (id: string) => Promise<void>;

  addPatrol: (patrol: Omit<Patrol, "id" | "createdAt">) => Promise<void>;
  updatePatrol: (id: string, updates: Partial<Patrol>) => Promise<void>;
  deletePatrol: (id: string) => Promise<void>;

  addScoutGroup: (name: string) => Promise<void>;
  updateScoutGroup: (id: string, name: string) => Promise<void>;
  deleteScoutGroup: (id: string) => Promise<void>;
  importScoutGroupsFromTemplate: (templateId: string) => Promise<void>;

  saveCurrentGroupsAsTemplate: (templateName: string) => Promise<void>;
  deleteScoutGroupTemplate: (id: string) => Promise<void>;

  setScore: (patrolId: string, stationId: string, score: number) => Promise<void>;
  getScore: (patrolId: string, stationId: string) => number;
  getScoreSaveState: (patrolId: string, stationId: string) => SaveState;
  retrySaveScore: (patrolId: string, stationId: string) => Promise<void>;

  getPatrolsWithScores: (section?: ScoutSection) => PatrolWithScore[];
  getStationScores: (stationId: string) => Array<{ patrol: Patrol; score: number }>;
  getScoutGroupName: (groupId: string) => string | undefined;

  updateCompetition: (updates: Partial<Competition>) => void;
}

const CompetitionContext = createContext<CompetitionContextType | undefined>(undefined);
const SELECTED_KEY = "scout-selected-competition";
const scoreKey = (patrolId: string, stationId: string) => `${patrolId}:${stationId}`;

function mapDbCompetition(row: any): Competition {
  const status: CompetitionStatus = row.is_active ? "active" : "closed";
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    status,
    stations: [],
    patrols: [],
    scores: [],
    scoutGroups: [],
    createdAt: row.created_at ?? new Date().toISOString(),
    closedAt: row.closed_at ?? undefined,
  };
}

function mapDbStation(row: any): Station {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    maxScore: row.max_score ?? 0,
    leaderEmail: row.leader_email ?? undefined,
    allowedSections: row.allowed_sections ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapDbPatrol(row: any): Patrol {
  return {
    id: row.id,
    name: row.name,
    section: row.section,
    scoutGroupId: row.scout_group_id ?? undefined,
    members: row.members ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapDbScore(row: any): Score {
  return {
    id: row.id,
    patrolId: row.patrol_id,
    stationId: row.station_id,
    score: row.score,
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

function mapDbScoutGroup(row: any): ScoutGroup {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapDbTemplate(row: any): ScoutGroupTemplate {
  return {
    id: row.id,
    name: row.name,
    groups: row.groups ?? [],
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

export function CompetitionProvider({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = useAuth();

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => localStorage.getItem(SELECTED_KEY));
  const [scoutGroupTemplates, setScoutGroupTemplates] = useState<ScoutGroupTemplate[]>([]);

  const competition = useMemo(
    () => competitions.find((c) => c.id === selectedId) ?? null,
    [competitions, selectedId]
  );

  const activeCompetitions = useMemo(
    () => competitions.filter((c) => c.status === "active"),
    [competitions]
  );

  const archivedCompetitions = useMemo(
    () => competitions.filter((c) => c.status === "closed"),
    [competitions]
  );

  const stations = competition?.stations ?? [];
  const patrols = competition?.patrols ?? [];
  const scores = competition?.scores ?? [];
  const scoutGroups = competition?.scoutGroups ?? [];

  useEffect(() => {
    if (selectedId) localStorage.setItem(SELECTED_KEY, selectedId);
    else localStorage.removeItem(SELECTED_KEY);
  }, [selectedId]);

  const refreshAll = useCallback(async () => {
    const { data: comps, error } = await supabase
      .from("competitions")
      .select("id,name,date,is_active,created_at,closed_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load competitions:", error);
      setCompetitions([]);
      return;
    }

    let mapped = (comps ?? []).map(mapDbCompetition);

    // 🔐 SCORER-FILTER (ENDA NYA LOGIKEN)
    if (!isAdmin && user?.id) {
      const { data: perms } = await supabase
        .from("scorer_permissions")
        .select("competition_id")
        .eq("user_id", user.id);

      const allowed = new Set((perms ?? []).map(p => p.competition_id));

      mapped = mapped.filter(
        c => c.status === "active" && allowed.has(c.id)
      );
    }

    setCompetitions(mapped);

    // 🔁 KORREKT DEFAULT-VAL
    if (mapped.length === 0) {
      setSelectedId(null);
    } else if (!mapped.find(c => c.id === selectedId)) {
      setSelectedId(mapped[0].id);
    }
  }, [isAdmin, user?.id, selectedId]);

  const refreshTemplates = useCallback(async () => {
    const { data } = await supabase
      .from("scout_group_templates")
      .select("id,name,groups,created_at")
      .order("created_at", { ascending: false });

    setScoutGroupTemplates((data ?? []).map(mapDbTemplate));
  }, []);

  useEffect(() => {
    refreshAll();
    refreshTemplates();
  }, [refreshAll, refreshTemplates]);

  return (
    <CompetitionContext.Provider
      value={{
        competitions,
        activeCompetitions,
        archivedCompetitions,

        competition,
        stations,
        patrols,
        scores,
        scoutGroups,

        scoutGroupTemplates,

        createCompetition: async () => { throw new Error("Not modified"); },
        selectCompetition: setSelectedId,
        closeCompetition: async () => {},
        reopenCompetition: async () => {},
        deleteCompetition: async () => {},
        updateCompetitionById: () => {},

        addStation: async () => {},
        updateStation: async () => {},
        deleteStation: async () => {},

        addPatrol: async () => {},
        updatePatrol: async () => {},
        deletePatrol: async () => {},

        addScoutGroup: async () => {},
        updateScoutGroup: async () => {},
        deleteScoutGroup: async () => {},
        importScoutGroupsFromTemplate: async () => {},

        saveCurrentGroupsAsTemplate: async () => {},
        deleteScoutGroupTemplate: async () => {},

        setScore: async () => {},
        getScore: () => 0,
        getScoreSaveState: () => "idle",
        retrySaveScore: async () => {},

        getPatrolsWithScores: () => [],
        getStationScores: () => [],
        getScoutGroupName: () => undefined,

        updateCompetition: () => {},
      }}
    >
      {children}
    </CompetitionContext.Provider>
  );
}

export function useCompetition() {
  const ctx = useContext(CompetitionContext);
  if (!ctx) throw new Error("useCompetition must be used within CompetitionProvider");
  return ctx;
}
