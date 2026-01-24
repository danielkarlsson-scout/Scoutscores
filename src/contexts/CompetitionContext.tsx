import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
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

  // Station actions
  addStation: (station: Omit<Station, "id" | "createdAt">) => void;
  updateStation: (id: string, updates: Partial<Station>) => void;
  deleteStation: (id: string) => void;

  // Patrol actions
  addPatrol: (patrol: Omit<Patrol, "id" | "createdAt">) => void;
  updatePatrol: (id: string, updates: Partial<Patrol>) => void;
  deletePatrol: (id: string) => void;

  // Scout Group actions (DB-kopplade)
  addScoutGroup: (name: string) => Promise<void>;
  updateScoutGroup: (id: string, name: string) => Promise<void>;
  deleteScoutGroup: (id: string) => Promise<void>;
  importScoutGroupsFromTemplate: (templateId: string) => Promise<void>;

  // Scout Group Template actions (lokalt i localStorage)
  scoutGroupTemplates: ScoutGroupTemplate[];
  createScoutGroupTemplate: (name: string, groups: string[]) => void;
  deleteScoutGroupTemplate: (id: string) => void;
  saveCurrentGroupsAsTemplate: (templateName: string) => void;

  // Score actions
  setScore: (patrolId: string, stationId: string, score: number) => void;
  getScore: (patrolId: string, stationId: string) => number;

  // Computed data
  getPatrolsWithScores: (section?: ScoutSection) => PatrolWithScore[];
  getStationScores: (stationId: string) => Array<{ patrol: Patrol; score: number }>;
  getScoutGroupName: (groupId: string) => string | undefined;

  // Competition actions
  updateCompetition: (updates: Partial<Competition>) => void;

  // Optional: refresh competitions from DB (praktiskt efter admin-åtgärder)
  refreshCompetitions: () => Promise<void>;
}

const CompetitionContext = createContext<CompetitionContextType | undefined>(undefined);

const SELECTED_KEY = "scout-selected-competition";
const TEMPLATES_KEY = "scout-group-templates";

const generateId = () => Math.random().toString(36).substring(2, 15);

export function CompetitionProvider({ children }: { children: React.ReactNode }) {
  // ✅ Source of truth = DB
  const [competitions, setCompetitions] = useState<Competition[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return localStorage.getItem(SELECTED_KEY);
  });

  useEffect(() => {
    if (selectedId) localStorage.setItem(SELECTED_KEY, selectedId);
    else localStorage.removeItem(SELECTED_KEY);
  }, [selectedId]);

  // Scout group templates (fortsatt lokalt)
  const [scoutGroupTemplates, setScoutGroupTemplates] = useState<ScoutGroupTemplate[]>(() => {
    const stored = localStorage.getItem(TEMPLATES_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(scoutGroupTemplates));
  }, [scoutGroupTemplates]);

  // ✅ Hämta competitions från Supabase (så mobil funkar)
  const refreshCompetitions = useCallback(async () => {
    const { data, error } = await supabase
      .from("competitions")
      .select("id,name,date,is_active,created_at")
      .order("date", { ascending: true });

    if (error) {
      console.error("Failed to load competitions:", error);
      setCompetitions([]);
      return;
    }

    const mapped: Competition[] = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      date: row.date,
      status: row.is_active ? ("active" as CompetitionStatus) : ("closed" as CompetitionStatus),
      stations: [], // DB-koppling kan göras senare
      patrols: [],
      scores: [],
      scoutGroups: [],
      createdAt: row.created_at ?? new Date().toISOString(),
      closedAt: row.is_active ? undefined : row.created_at ?? new Date().toISOString(),
    }));

    setCompetitions(mapped);
  }, []);

  useEffect(() => {
    refreshCompetitions();
  }, [refreshCompetitions]);

  // Derived state
  const competition = competitions.find((c) => c.id === selectedId) ?? null;
  const activeCompetitions = competitions.filter((c) => c.status === "active");
  const archivedCompetitions = competitions.filter((c) => c.status === "closed");
  const stations = competition?.stations ?? [];
  const patrols = competition?.patrols ?? [];
  const scores = competition?.scores ?? [];
  const scoutGroups = competition?.scoutGroups ?? [];

  // Auto-select first active competition if none selected
  useEffect(() => {
    if (!selectedId && activeCompetitions.length > 0) {
      setSelectedId(activeCompetitions[0].id);
    }
  }, [selectedId, activeCompetitions]);

  // Helper to update current competition
  const updateCurrentCompetition = useCallback(
    (updater: (comp: Competition) => Competition) => {
      if (!selectedId) return;
      setCompetitions((prev) => prev.map((c) => (c.id === selectedId ? updater(c) : c)));
    },
    [selectedId]
  );

  // ✅ Hämta kårer från Supabase när vald tävling ändras
  useEffect(() => {
    if (!selectedId) return;

    (async () => {
      const { data, error } = await supabase
        .from("scout_groups")
        .select("id,name,competition_id,created_at")
        .eq("competition_id", selectedId)
        .order("name", { ascending: true });

      if (error) {
        console.error("Kunde inte hämta kårer från databasen:", error);
        return;
      }

      const groups: ScoutGroup[] = (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at ?? new Date().toISOString(),
      }));

      setCompetitions((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, scoutGroups: groups } : c))
      );
    })();
  }, [selectedId]);

  // Competition management
  const createCompetition = useCallback(async (data: { name: string; date: string }): Promise<Competition> => {
    const name = data.name.trim();
    const date = data.date;

    if (!name) throw new Error("Competition name is required");

    const { data: dbComp, error } = await supabase
      .from("competitions")
      .insert({ name, date, is_active: true })
      .select("id,name,date,is_active,created_at")
      .single();

    if (error || !dbComp) {
      console.error("Failed to create competition in DB:", error);
      throw error ?? new Error("Failed to create competition");
    }

    const newCompetition: Competition = {
      id: dbComp.id,
      name: dbComp.name,
      date: dbComp.date,
      status: "active",
      stations: [],
      patrols: [],
      scores: [],
      scoutGroups: [],
      createdAt: dbComp.created_at ?? new Date().toISOString(),
    };

    setCompetitions((prev) => [...prev, newCompetition]);
    setSelectedId(newCompetition.id);

    return newCompetition;
  }, []);

  const selectCompetition = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  // ✅ DB: is_active = false när arkivera
  const closeCompetition = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("competitions").update({ is_active: false }).eq("id", id);
      if (error) {
        console.error("Failed to close competition in DB:", error);
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status: "closed" as CompetitionStatus, closedAt: new Date().toISOString() } : c
        )
      );

      if (id === selectedId) {
        const remaining = competitions.filter((c) => c.id !== id && c.status === "active");
        setSelectedId(remaining[0]?.id ?? null);
      }
    },
    [competitions, selectedId]
  );

  // ✅ DB: is_active = true när återöppna
  const reopenCompetition = useCallback(async (id: string) => {
    const { error } = await supabase.from("competitions").update({ is_active: true }).eq("id", id);
    if (error) {
      console.error("Failed to reopen competition in DB:", error);
      return;
    }

    setCompetitions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "active" as CompetitionStatus, closedAt: undefined } : c))
    );
  }, []);

  // ✅ DB: delete competition row (om du vill ha “riktig delete”)
  const deleteCompetition = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("competitions").delete().eq("id", id);
      if (error) {
        console.error("Failed to delete competition in DB:", error);
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

  const updateCompetitionById = useCallback((id: string, updates: Partial<Competition>) => {
    // OBS: den här uppdaterar bara lokal state. Om du vill DB-synka namn/datum också
    // kan vi lägga till supabase.update här senare.
    setCompetitions((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, []);

  // Station actions (fortfarande lokalt)
  const addStation = useCallback(
    (station: Omit<Station, "id" | "createdAt">) => {
      updateCurrentCompetition((comp) => ({
        ...comp,
        stations: [...comp.stations, { ...station, id: generateId(), createdAt: new Date().toISOString() }],
      }));
    },
    [updateCurrentCompetition]
  );

  const updateStation = useCallback(
    (id: string, updates: Partial<Station>) => {
      updateCurrentCompetition((comp) => ({
        ...comp,
        stations: comp.stations.map((s) => (s.id === id ? { ...s, ...updates } : s)),
      }));
    },
    [updateCurrentCompetition]
  );

  const deleteStation = useCallback(
    (id: string) => {
      updateCurrentCompetition((comp) => ({
        ...comp,
        stations: comp.stations.filter((s) => s.id !== id),
        scores: comp.scores.filter((s) => s.stationId !== id),
      }));
    },
    [updateCurrentCompetition]
  );

  // Patrol actions (fortfarande lokalt)
  const addPatrol = useCallback(
    (patrol: Omit<Patrol, "id" | "createdAt">) => {
      updateCurrentCompetition((comp) => ({
        ...comp,
        patrols: [...comp.patrols, { ...patrol, id: generateId(), createdAt: new Date().toISOString() }],
      }));
    },
    [updateCurrentCompetition]
  );

  const updatePatrol = useCallback(
    (id: string, updates: Partial<Patrol>) => {
      updateCurrentCompetition((comp) => ({
        ...comp,
        patrols: comp.patrols.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      }));
    },
    [updateCurrentCompetition]
  );

  const deletePatrol = useCallback(
    (id: string) => {
      updateCurrentCompetition((comp) => ({
        ...comp,
        patrols: comp.patrols.filter((p) => p.id !== id),
        scores: comp.scores.filter((s) => s.patrolId !== id),
      }));
    },
    [updateCurrentCompetition]
  );

  // Score actions (lokalt)
  const setScore = useCallback(
    (patrolId: string, stationId: string, score: number) => {
      updateCurrentCompetition((comp) => {
        const existingIndex = comp.scores.findIndex((s) => s.patrolId === patrolId && s.stationId === stationId);

        const newScore: Score = {
          id: existingIndex >= 0 ? comp.scores[existingIndex].id : generateId(),
          patrolId,
          stationId,
          score,
          updatedAt: new Date().toISOString(),
        };

        if (existingIndex >= 0) {
          const newScores = [...comp.scores];
          newScores[existingIndex] = newScore;
          return { ...comp, scores: newScores };
        }

        return { ...comp, scores: [...comp.scores, newScore] };
      });
    },
    [updateCurrentCompetition]
  );

  const getScore = useCallback(
    (patrolId: string, stationId: string) => {
      const scoreRecord = scores.find((s) => s.patrolId === patrolId && s.stationId === stationId);
      return scoreRecord?.score ?? 0;
    },
    [scores]
  );

  // Computed data
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

        return { ...patrol, totalScore, stationScores };
      });

      patrolsWithScores.sort((a, b) => b.totalScore - a.totalScore);
      patrolsWithScores.forEach((patrol, index) => {
        patrol.rank = index + 1;
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

  const updateCompetition = useCallback(
    (updates: Partial<Competition>) => {
      updateCurrentCompetition((comp) => ({ ...comp, ...updates }));
    },
    [updateCurrentCompetition]
  );

  // ✅ Scout Group actions (DB-kopplade)
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
        console.error("Kunde inte skapa kår:", error);
        return;
      }

      const newGroup: ScoutGroup = {
        id: data.id,
        name: data.name,
        createdAt: data.created_at ?? new Date().toISOString(),
      };

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
        console.error("Kunde inte uppdatera kår:", error);
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
        console.error("Kunde inte ta bort kår:", error);
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
    (groupId: string): string | undefined => {
      return scoutGroups.find((g) => g.id === groupId)?.name;
    },
    [scoutGroups]
  );

  // Scout Group Template actions
  const createScoutGroupTemplate = useCallback((name: string, groups: string[]) => {
    setScoutGroupTemplates((prev) => [
      ...prev,
      { id: generateId(), name: name.trim(), groups, createdAt: new Date().toISOString() },
    ]);
  }, []);

  const deleteScoutGroupTemplate = useCallback((id: string) => {
    setScoutGroupTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const saveCurrentGroupsAsTemplate = useCallback(
    (templateName: string) => {
      const groupNames = scoutGroups.map((g) => g.name);
      if (groupNames.length > 0) createScoutGroupTemplate(templateName, groupNames);
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

      const rowsToInsert = namesToAdd.map((name) => ({ name, competition_id: selectedId }));

      const { data, error } = await supabase.from("scout_groups").insert(rowsToInsert).select("id,name,created_at");

      if (error) {
        console.error("Kunde inte importera kårer från mall:", error);
        return;
      }

      const newGroups: ScoutGroup[] = (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at ?? new Date().toISOString(),
      }));

      updateCurrentCompetition((comp) => ({
        ...comp,
        scoutGroups: [...(comp.scoutGroups ?? []), ...newGroups],
      }));
    },
    [selectedId, scoutGroupTemplates, scoutGroups, updateCurrentCompetition]
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
        getPatrolsWithScores,
        getStationScores,
        getScoutGroupName,
        updateCompetition,
        refreshCompetitions,
      }}
    >
      {children}
    </CompetitionContext.Provider>
  );
}

export function useCompetition() {
  const context = useContext(CompetitionContext);
  if (context === undefined) throw new Error("useCompetition must be used within a CompetitionProvider");
  return context;
}
