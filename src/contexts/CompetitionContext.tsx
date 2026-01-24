import React, { createContext, useContext, useEffect, useMemo, useCallback, useState } from "react";
import {
  Competition,
  Station,
  Patrol,
  Score,
  ScoutSection,
  PatrolWithScore,
  CompetitionStatus,
  ScoutGroup,
  ScoutGroupTemplate,
} from "@/types/competition";
import { supabase } from "@/integrations/supabase/client";

type SaveState = "idle" | "saving" | "saved" | "error";

interface CompetitionContextType {
  // All competitions
  competitions: Competition[];
  activeCompetitions: Competition[];
  archivedCompetitions: Competition[];

  // Current competition
  competition: Competition | null;
  stations: Station[];
  patrols: Patrol[];
  scores: Score[];
  scoutGroups: ScoutGroup[];

  // Competition management
  createCompetition: (data: { name: string; date: string }) => Promise<Competition>;
  selectCompetition: (id: string) => void;
  closeCompetition: (id: string) => Promise<void>;
  reopenCompetition: (id: string) => Promise<void>;
  deleteCompetition: (id: string) => Promise<void>;
  updateCompetitionById: (id: string, updates: Partial<Competition>) => void;

  // Station actions (DB)
  addStation: (station: Omit<Station, "id" | "createdAt">) => Promise<void>;
  updateStation: (id: string, updates: Partial<Station>) => Promise<void>;
  deleteStation: (id: string) => Promise<void>;

  // Patrol actions (DB)
  addPatrol: (patrol: Omit<Patrol, "id" | "createdAt">) => Promise<void>;
  updatePatrol: (id: string, updates: Partial<Patrol>) => Promise<void>;
  deletePatrol: (id: string) => Promise<void>;

  // Scout Group actions (DB)
  addScoutGroup: (name: string) => Promise<void>;
  updateScoutGroup: (id: string, name: string) => Promise<void>;
  deleteScoutGroup: (id: string) => Promise<void>;
  importScoutGroupsFromTemplate: (templateId: string) => Promise<void>;

  // Scout Group Template actions (DB)
  scoutGroupTemplates: ScoutGroupTemplate[];
  createScoutGroupTemplate: (name: string, groups: string[]) => Promise<void>;
  deleteScoutGroupTemplate: (id: string) => Promise<void>;
  saveCurrentGroupsAsTemplate: (templateName: string) => Promise<void>;

  // Score actions (DB + save state)
  setScore: (patrolId: string, stationId: string, score: number) => Promise<void>;
  getScore: (patrolId: string, stationId: string) => number;
  getScoreSaveState: (patrolId: string, stationId: string) => SaveState;

  // Computed data
  getPatrolsWithScores: (section?: ScoutSection) => PatrolWithScore[];
  getStationScores: (stationId: string) => Array<{ patrol: Patrol; score: number }>;
  getScoutGroupName: (groupId: string) => string | undefined;

  // Competition actions
  updateCompetition: (updates: Partial<Competition>) => void;
}

const CompetitionContext = createContext<CompetitionContextType | undefined>(undefined);

const SELECTED_KEY = "scout-selected-competition";
const generateId = () => Math.random().toString(36).substring(2, 15);

function mapCompetitionRow(row: any): Competition {
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

function mapStationRow(row: any): Station {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    maxScore: row.max_score ?? row.maxScore ?? 0,
    leaderEmail: row.leader_email ?? undefined,
    allowedSections: row.allowed_sections ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapPatrolRow(row: any): Patrol {
  return {
    id: row.id,
    name: row.name,
    section: row.section as ScoutSection,
    scoutGroupId: row.scout_group_id ?? undefined,
    members: row.members ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapScoreRow(row: any): Score {
  return {
    id: row.id,
    patrolId: row.patrol_id,
    stationId: row.station_id,
    score: row.score ?? 0,
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

function mapScoutGroupRow(row: any): ScoutGroup {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapTemplateRow(row: any): ScoutGroupTemplate {
  return {
    id: row.id,
    name: row.name,
    groups: (row.groups ?? []) as string[],
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

export function CompetitionProvider({ children }: { children: React.ReactNode }) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => localStorage.getItem(SELECTED_KEY));

  // NEW: Save-state per (competitionId, patrolId, stationId)
  const [scoreSaveState, setScoreSaveState] = useState<Record<string, SaveState>>({});

  const scoreKey = useCallback(
    (patrolId: string, stationId: string) => `${selectedId ?? "no-comp"}:${patrolId}:${stationId}`,
    [selectedId]
  );

  const getScoreSaveState = useCallback(
    (patrolId: string, stationId: string): SaveState => {
      const key = scoreKey(patrolId, stationId);
      return scoreSaveState[key] ?? "idle";
    },
    [scoreKey, scoreSaveState]
  );

  // Persist selected competition
  useEffect(() => {
    if (selectedId) localStorage.setItem(SELECTED_KEY, selectedId);
    else localStorage.removeItem(SELECTED_KEY);
  }, [selectedId]);

  // Derived state
  const competition = useMemo(() => competitions.find((c) => c.id === selectedId) ?? null, [competitions, selectedId]);
  const activeCompetitions = useMemo(() => competitions.filter((c) => c.status === "active"), [competitions]);
  const archivedCompetitions = useMemo(() => competitions.filter((c) => c.status === "closed"), [competitions]);

  const stations = competition?.stations ?? [];
  const patrols = competition?.patrols ?? [];
  const scores = competition?.scores ?? [];
  const scoutGroups = competition?.scoutGroups ?? [];

  // Helper to update a specific competition in state
  const updateCompetitionById = useCallback((id: string, updates: Partial<Competition>) => {
    setCompetitions((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, []);

  // Helper to update currently selected competition in state
  const updateCurrentCompetition = useCallback(
    (updater: (comp: Competition) => Competition) => {
      if (!selectedId) return;
      setCompetitions((prev) => prev.map((c) => (c.id === selectedId ? updater(c) : c)));
    },
    [selectedId]
  );

  // 1) Load competitions from DB
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("competitions")
        .select("id,name,date,is_active,created_at,closed_at")
        .order("date", { ascending: true });

      if (error) {
        console.error("Failed to load competitions:", error);
        setCompetitions([]);
        return;
      }

      const list: Competition[] = (data ?? []).map(mapCompetitionRow);
      setCompetitions(list);

      // Auto-select first active if none selected
      if (!selectedId) {
        const firstActive = list.find((c) => c.status === "active");
        if (firstActive) setSelectedId(firstActive.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Load templates from DB (global)
  const [scoutGroupTemplates, setScoutGroupTemplates] = useState<ScoutGroupTemplate[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("scout_group_templates")
        .select("id,name,groups,created_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load scout group templates:", error);
        setScoutGroupTemplates([]);
        return;
      }

      setScoutGroupTemplates((data ?? []).map(mapTemplateRow));
    })();
  }, []);

  // 3) Load competition-scoped data when selected changes
  useEffect(() => {
    if (!selectedId) return;

    (async () => {
      const competitionId = selectedId;

      const [groupsRes, stationsRes, patrolsRes, scoresRes] = await Promise.all([
        supabase
          .from("scout_groups")
          .select("id,name,competition_id,created_at")
          .eq("competition_id", competitionId)
          .order("name", { ascending: true }),

        supabase
          .from("stations")
          .select("id,competition_id,name,description,max_score,leader_email,allowed_sections,created_at")
          .eq("competition_id", competitionId)
          .order("created_at", { ascending: true }),

        supabase
          .from("patrols")
          .select("id,competition_id,name,section,scout_group_id,members,created_at")
          .eq("competition_id", competitionId)
          .order("created_at", { ascending: true }),

        supabase
          .from("scores")
          .select("id,competition_id,patrol_id,station_id,score,updated_at")
          .eq("competition_id", competitionId),
      ]);

      if (groupsRes.error) console.error("Failed to load scout_groups:", groupsRes.error);
      if (stationsRes.error) console.error("Failed to load stations:", stationsRes.error);
      if (patrolsRes.error) console.error("Failed to load patrols:", patrolsRes.error);
      if (scoresRes.error) console.error("Failed to load scores:", scoresRes.error);

      const nextGroups = (groupsRes.data ?? []).map(mapScoutGroupRow);
      const nextStations = (stationsRes.data ?? []).map(mapStationRow);
      const nextPatrols = (patrolsRes.data ?? []).map(mapPatrolRow);
      const nextScores = (scoresRes.data ?? []).map(mapScoreRow);

      updateCompetitionById(competitionId, {
        scoutGroups: nextGroups,
        stations: nextStations,
        patrols: nextPatrols,
        scores: nextScores,
      });
    })();
  }, [selectedId, updateCompetitionById]);

  // Competition management
  const createCompetition = useCallback(async (data: { name: string; date: string }): Promise<Competition> => {
    const name = data.name.trim();
    const date = data.date;

    if (!name) throw new Error("Competition name is required");

    const { data: dbComp, error } = await supabase
      .from("competitions")
      .insert({ name, date, is_active: true })
      .select("id,name,date,is_active,created_at,closed_at")
      .single();

    if (error || !dbComp) {
      console.error("Failed to create competition:", error);
      throw error ?? new Error("Failed to create competition");
    }

    const newCompetition = mapCompetitionRow(dbComp);
    // Keep arrays empty; they load via effect when selected
    newCompetition.stations = [];
    newCompetition.patrols = [];
    newCompetition.scores = [];
    newCompetition.scoutGroups = [];

    setCompetitions((prev) => [...prev, newCompetition]);
    setSelectedId(newCompetition.id);

    return newCompetition;
  }, []);

  const selectCompetition = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const closeCompetition = useCallback(
    async (id: string) => {
      const closedAt = new Date().toISOString();

      const { error } = await supabase
        .from("competitions")
        .update({ is_active: false, closed_at: closedAt })
        .eq("id", id);

      if (error) {
        console.error("Failed to close competition:", error);
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "closed", closedAt } : c))
      );

      if (id === selectedId) {
        const remaining = competitions.filter((c) => c.id !== id && c.status === "active");
        setSelectedId(remaining[0]?.id ?? null);
      }
    },
    [competitions, selectedId]
  );

  const reopenCompetition = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("competitions")
      .update({ is_active: true, closed_at: null })
      .eq("id", id);

    if (error) {
      console.error("Failed to reopen competition:", error);
      return;
    }

    setCompetitions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "active", closedAt: undefined } : c))
    );
  }, []);

  const deleteCompetition = useCallback(
    async (id: string) => {
      // NOTE: may fail if FK constraints exist (stations/patrols/scores/scout_groups)
      const { error } = await supabase.from("competitions").delete().eq("id", id);
      if (error) {
        console.error("Failed to delete competition:", error);
        return;
      }

      setCompetitions((prev) => prev.filter((c) => c.id !== id));
      if (id === selectedId) {
        const remaining = competitions.filter((c) => c.id !== id && c.status === "active");
        setSelectedId(remaining[0]?.id ?? null);
      }
    },
    [competitions, selectedId]
  );

  const updateCompetition = useCallback(
    (updates: Partial<Competition>) => {
      updateCurrentCompetition((comp) => ({ ...comp, ...updates }));
    },
    [updateCurrentCompetition]
  );

  // Station actions (DB)
  const addStation = useCallback(
    async (station: Omit<Station, "id" | "createdAt">) => {
      if (!selectedId) return;

      const payload: any = {
        competition_id: selectedId,
        name: station.name,
        description: station.description ?? "",
        max_score: station.maxScore,
        leader_email: station.leaderEmail ?? null,
        allowed_sections: station.allowedSections ?? null,
      };

      const { data, error } = await supabase
        .from("stations")
        .insert(payload)
        .select("id,competition_id,name,description,max_score,leader_email,allowed_sections,created_at")
        .single();

      if (error || !data) {
        console.error("Failed to create station:", error);
        return;
      }

      const newStation = mapStationRow(data);
      updateCurrentCompetition((comp) => ({ ...comp, stations: [...comp.stations, newStation] }));
    },
    [selectedId, updateCurrentCompetition]
  );

  const updateStation = useCallback(
    async (id: string, updates: Partial<Station>) => {
      const payload: any = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.maxScore !== undefined) payload.max_score = updates.maxScore;
      if (updates.leaderEmail !== undefined) payload.leader_email = updates.leaderEmail ?? null;
      if (updates.allowedSections !== undefined) payload.allowed_sections = updates.allowedSections ?? null;

      const { error } = await supabase.from("stations").update(payload).eq("id", id);

      if (error) {
        console.error("Failed to update station:", error);
        return;
      }

      updateCurrentCompetition((comp) => ({
        ...comp,
        stations: comp.stations.map((s) => (s.id === id ? { ...s, ...updates } : s)),
      }));
    },
    [updateCurrentCompetition]
  );

  const deleteStation = useCallback(
    async (id: string) => {
      // optional cleanup of scores for this station
      await supabase.from("scores").delete().eq("station_id", id);
      const { error } = await supabase.from("stations").delete().eq("id", id);

      if (error) {
        console.error("Failed to delete station:", error);
        return;
      }

      updateCurrentCompetition((comp) => ({
        ...comp,
        stations: comp.stations.filter((s) => s.id !== id),
        scores: comp.scores.filter((sc) => sc.stationId !== id),
      }));
    },
    [updateCurrentCompetition]
  );

  // Patrol actions (DB)
  const addPatrol = useCallback(
    async (patrol: Omit<Patrol, "id" | "createdAt">) => {
      if (!selectedId) return;

      const payload: any = {
        competition_id: selectedId,
        name: patrol.name,
        section: patrol.section,
        scout_group_id: patrol.scoutGroupId ?? null,
        members: patrol.members ?? null,
      };

      const { data, error } = await supabase
        .from("patrols")
        .insert(payload)
        .select("id,competition_id,name,section,scout_group_id,members,created_at")
        .single();

      if (error || !data) {
        console.error("Failed to create patrol:", error);
        return;
      }

      const newPatrol = mapPatrolRow(data);
      updateCurrentCompetition((comp) => ({ ...comp, patrols: [...comp.patrols, newPatrol] }));
    },
    [selectedId, updateCurrentCompetition]
  );

  const updatePatrol = useCallback(
    async (id: string, updates: Partial<Patrol>) => {
      const payload: any = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.section !== undefined) payload.section = updates.section;
      if (updates.scoutGroupId !== undefined) payload.scout_group_id = updates.scoutGroupId ?? null;
      if (updates.members !== undefined) payload.members = updates.members ?? null;

      const { error } = await supabase.from("patrols").update(payload).eq("id", id);

      if (error) {
        console.error("Failed to update patrol:", error);
        return;
      }

      updateCurrentCompetition((comp) => ({
        ...comp,
        patrols: comp.patrols.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      }));
    },
    [updateCurrentCompetition]
  );

  const deletePatrol = useCallback(
    async (id: string) => {
      // optional cleanup of scores for this patrol
      await supabase.from("scores").delete().eq("patrol_id", id);
      const { error } = await supabase.from("patrols").delete().eq("id", id);

      if (error) {
        console.error("Failed to delete patrol:", error);
        return;
      }

      updateCurrentCompetition((comp) => ({
        ...comp,
        patrols: comp.patrols.filter((p) => p.id !== id),
        scores: comp.scores.filter((sc) => sc.patrolId !== id),
      }));
    },
    [updateCurrentCompetition]
  );

  // Scout Group actions (DB)
  const addScoutGroup = useCallback(
    async (name: string) => {
      if (!selectedId) return;
      const trimmed = name.trim();
      if (!trimmed) return;

      const { data, error } = await supabase
        .from("scout_groups")
        .insert({ name: trimmed, competition_id: selectedId })
        .select("id,name,created_at")
        .single();

      if (error || !data) {
        console.error("Failed to create scout group:", error);
        return;
      }

      const newGroup = mapScoutGroupRow(data);
      updateCurrentCompetition((comp) => ({
        ...comp,
        scoutGroups: [...(comp.scoutGroups ?? []), newGroup],
      }));
    },
    [selectedId, updateCurrentCompetition]
  );

  const updateScoutGroup = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      const { error } = await supabase.from("scout_groups").update({ name: trimmed }).eq("id", id);
      if (error) {
        console.error("Failed to update scout group:", error);
        return;
      }

      updateCurrentCompetition((comp) => ({
        ...comp,
        scoutGroups: (comp.scoutGroups ?? []).map((g) => (g.id === id ? { ...g, name: trimmed } : g)),
      }));
    },
    [updateCurrentCompetition]
  );

  const deleteScoutGroup = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("scout_groups").delete().eq("id", id);
      if (error) {
        console.error("Failed to delete scout group:", error);
        return;
      }

      updateCurrentCompetition((comp) => ({
        ...comp,
        scoutGroups: (comp.scoutGroups ?? []).filter((g) => g.id !== id),
        patrols: comp.patrols.map((p) => (p.scoutGroupId === id ? { ...p, scoutGroupId: undefined } : p)),
      }));
    },
    [updateCurrentCompetition]
  );

  const getScoutGroupName = useCallback(
    (groupId: string): string | undefined => scoutGroups.find((g) => g.id === groupId)?.name,
    [scoutGroups]
  );

  // Templates (DB)
  const createScoutGroupTemplate = useCallback(async (name: string, groups: string[]) => {
    const trimmed = name.trim();
    const cleanGroups = groups.map((g) => g.trim()).filter(Boolean);

    if (!trimmed || cleanGroups.length === 0) return;

    const { data, error } = await supabase
      .from("scout_group_templates")
      .insert({ name: trimmed, groups: cleanGroups })
      .select("id,name,groups,created_at")
      .single();

    if (error || !data) {
      console.error("Failed to create template:", error);
      return;
    }

    setScoutGroupTemplates((prev) => [mapTemplateRow(data), ...prev]);
  }, []);

  const deleteScoutGroupTemplate = useCallback(async (id: string) => {
    const { error } = await supabase.from("scout_group_templates").delete().eq("id", id);
    if (error) {
      console.error("Failed to delete template:", error);
      return;
    }
    setScoutGroupTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const saveCurrentGroupsAsTemplate = useCallback(
    async (templateName: string) => {
      const groupNames = scoutGroups.map((g) => g.name);
      if (groupNames.length === 0) return;
      await createScoutGroupTemplate(templateName, groupNames);
    },
    [scoutGroups, createScoutGroupTemplate]
  );

  const importScoutGroupsFromTemplate = useCallback(
    async (templateId: string) => {
      if (!selectedId) return;

      const template = scoutGroupTemplates.find((t) => t.id === templateId);
      if (!template) return;

      const existingNames = new Set((scoutGroups ?? []).map((g) => g.name.toLowerCase()));
      const namesToAdd = template.groups.filter((n) => !existingNames.has(n.toLowerCase()));
      if (namesToAdd.length === 0) return;

      const rows = namesToAdd.map((name) => ({ name, competition_id: selectedId }));

      const { data, error } = await supabase
        .from("scout_groups")
        .insert(rows)
        .select("id,name,created_at");

      if (error) {
        console.error("Failed to import scout groups from template:", error);
        return;
      }

      const newGroups = (data ?? []).map(mapScoutGroupRow);

      updateCurrentCompetition((comp) => ({
        ...comp,
        scoutGroups: [...(comp.scoutGroups ?? []), ...newGroups],
      }));
    },
    [selectedId, scoutGroupTemplates, scoutGroups, updateCurrentCompetition]
  );

  // Scores (DB + optimistic UI + save state)
  const setScore = useCallback(
    async (patrolId: string, stationId: string, score: number) => {
      if (!selectedId) return;

      const key = `${selectedId}:${patrolId}:${stationId}`;

      // 1) optimistic update in local state
      updateCurrentCompetition((comp) => {
        const existingIndex = comp.scores.findIndex(
          (s) => s.patrolId === patrolId && s.stationId === stationId
        );

        const newScore: Score = {
          id: existingIndex >= 0 ? comp.scores[existingIndex].id : generateId(),
          patrolId,
          stationId,
          score,
          updatedAt: new Date().toISOString(),
        };

        if (existingIndex >= 0) {
          const next = [...comp.scores];
          next[existingIndex] = newScore;
          return { ...comp, scores: next };
        }

        return { ...comp, scores: [...comp.scores, newScore] };
      });

      // 2) set saving state
      setScoreSaveState((prev) => ({ ...prev, [key]: "saving" }));

      // 3) upsert to DB
      const { error } = await supabase.from("scores").upsert(
        {
          competition_id: selectedId,
          patrol_id: patrolId,
          station_id: stationId,
          score,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "competition_id,patrol_id,station_id" }
      );

      if (error) {
        console.error("Failed to save score:", error);
        setScoreSaveState((prev) => ({ ...prev, [key]: "error" }));
        return;
      }

      // 4) saved -> back to idle
      setScoreSaveState((prev) => ({ ...prev, [key]: "saved" }));
      window.setTimeout(() => {
        setScoreSaveState((prev) => ({ ...prev, [key]: "idle" }));
      }, 1200);
    },
    [selectedId, updateCurrentCompetition]
  );

  const getScore = useCallback(
    (patrolId: string, stationId: string) => {
      const scoreRecord = scores.find((s) => s.patrolId === patrolId && s.stationId === stationId);
      return scoreRecord?.score ?? 0;
    },
    [scores]
  );

  // Computed
  const getPatrolsWithScores = useCallback(
    (section?: ScoutSection): PatrolWithScore[] => {
      const filteredPatrols = section ? patrols.filter((p) => p.section === section) : patrols;

      const patrolsWithScores: PatrolWithScore[] = filteredPatrols.map((patrol) => {
        const patrolScores = scores.filter((s) => s.patrolId === patrol.id);
        const stationScores: Record<string, number> = {};
        let totalScore = 0;

        patrolScores.forEach((s) => {
          stationScores[s.stationId] = s.score;
          totalScore += s.score;
        });

        return {
          ...patrol,
          totalScore,
          stationScores,
        };
      });

      patrolsWithScores.sort((a, b) => b.totalScore - a.totalScore);
      patrolsWithScores.forEach((p, i) => {
        p.rank = i + 1;
      });

      return patrolsWithScores;
    },
    [patrols, scores]
  );

  const getStationScores = useCallback(
    (stationId: string) => {
      return patrols
        .map((patrol) => {
          const scoreRecord = scores.find((s) => s.patrolId === patrol.id && s.stationId === stationId);
          return { patrol, score: scoreRecord?.score ?? 0 };
        })
        .sort((a, b) => b.score - a.score);
    },
    [patrols, scores]
  );

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
        createCompetition,
        selectCompetition,
        closeCompetition,
        reopenCompetition,
        deleteCompetition,
        updateCompetitionById,
        addStation,
        updateStation,
        deleteStation,
        addPatrol,
        updatePatrol,
        deletePatrol,
        addScoutGroup,
        updateScoutGroup,
        deleteScoutGroup,
        importScoutGroupsFromTemplate,
        scoutGroupTemplates,
        createScoutGroupTemplate,
        deleteScoutGroupTemplate,
        saveCurrentGroupsAsTemplate,
        setScore,
        getScore,
        getScoreSaveState,
        getPatrolsWithScores,
        getStationScores,
        getScoutGroupName,
        updateCompetition,
      }}
    >
      {children}
    </CompetitionContext.Provider>
  );
}

export function useCompetition() {
  const context = useContext(CompetitionContext);
  if (context === undefined) {
    throw new Error("useCompetition must be used within a CompetitionProvider");
  }
  return context;
}
