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
  closeCompetition: (id: string) => void;
  reopenCompetition: (id: string) => void;
  deleteCompetition: (id: string) => void;
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

  // Scout Group Template actions (DB-kopplade)
  scoutGroupTemplates: ScoutGroupTemplate[];
  createScoutGroupTemplate: (name: string, groups: string[]) => Promise<void>;
  deleteScoutGroupTemplate: (id: string) => Promise<void>;
  saveCurrentGroupsAsTemplate: (templateName: string) => Promise<void>;

  // Score actions
  setScore: (patrolId: string, stationId: string, score: number) => void;
  getScore: (patrolId: string, stationId: string) => number;

  // Computed data
  getPatrolsWithScores: (section?: ScoutSection) => PatrolWithScore[];
  getStationScores: (stationId: string) => Array<{ patrol: Patrol; score: number }>;
  getScoutGroupName: (groupId: string) => string | undefined;

  // Competition actions
  updateCompetition: (updates: Partial<Competition>) => void;
}

const CompetitionContext = createContext<CompetitionContextType | undefined>(undefined);

const STORAGE_KEY = "scout-competitions-data";
const SELECTED_KEY = "scout-selected-competition";

const generateId = () => Math.random().toString(36).substring(2, 15);

export function CompetitionProvider({ children }: { children: React.ReactNode }) {
  const [competitions, setCompetitions] = useState<Competition[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    }
    return [];
  });

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return localStorage.getItem(SELECTED_KEY);
  });

  // ✅ Templates nu i DB
  const [scoutGroupTemplates, setScoutGroupTemplates] = useState<ScoutGroupTemplate[]>([]);

  // Save competitions to localStorage (fortfarande OK att ha lokalt om ni vill)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(competitions));
  }, [competitions]);

  useEffect(() => {
    if (selectedId) localStorage.setItem(SELECTED_KEY, selectedId);
    else localStorage.removeItem(SELECTED_KEY);
  }, [selectedId]);

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

  // ✅ Hämta templates från Supabase (en gång vid start)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("scout_group_templates")
        .select("id,name,groups,created_at")
        .order("name", { ascending: true });

      if (error) {
        console.error("Kunde inte hämta templates:", error);
        return;
      }

      const templates: ScoutGroupTemplate[] = (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        groups: Array.isArray(row.groups) ? row.groups : [],
        createdAt: row.created_at ?? new Date().toISOString(),
      }));

      setScoutGroupTemplates(templates);
    })();
  }, []);

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
      .select("id,name,date,is_active")
      .single();

    if (error || !dbComp) {
      console.error("Failed to create competition in DB:", error);
      throw error ?? new Error("Failed to create competition");
    }

    const newCompetition: Competition = {
      id: dbComp.id,
      name: dbComp.name,
      date: dbComp.date, // (om din typ är string|null är detta perfekt)
      status: "active",
      stations: [],
      patrols: [],
      scores: [],
      scoutGroups: [],
      createdAt: new Date().toISOString(),
    };

    setCompetitions((prev) => [...prev, newCompetition]);
    setSelectedId(newCompetition.id);

    return newCompetition;
  }, []);

  const selectCompetition = useCallback((id: string) => setSelectedId(id), []);

  const closeCompetition = useCallback(
    (id: string) => {
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

  const reopenCompetition = useCallback((id: string) => {
    setCompetitions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "active" as CompetitionStatus, closedAt: undefined } : c))
    );
  }, []);

  const deleteCompetition = useCallback(
    (id: string) => {
      setCompetitions((prev) => prev.filter((c) => c.id !== id));
      if (id === selectedId) {
        const remaining = competitions.filter((c) => c.id !== id && c.status === "active");
        setSelectedId(remaining[0]?.id ?? null);
      }
    },
    [competitions, selectedId]
  );

  // Station actions
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

  // Patrol actions
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

  // Score actions
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
    (patrolId: string, stationId: string) => scores.find((s) => s.patrolId === patrolId && s.stationId === stationId)?.score ?? 0,
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
      patrolsWithScores.forEach((p, idx) => (p.rank = idx + 1));
      return patrolsWithScores;
    },
    [patrols, scores]
  );

  const getStationScores = useCallback(
    (stationId: string) =>
      patrols
        .map((patrol) => ({
          patrol,
          score: scores.find((s) => s.patrolId === patrol.id && s.stationId === stationId)?.score ?? 0,
        }))
        .sort((a, b) => b.score - a.score),
    [patrols, scores]
  );

  const updateCompetition = useCallback(
    (updates: Partial<Competition>) => updateCurrentCompetition((comp) => ({ ...comp, ...updates })),
    [updateCurrentCompetition]
  );

  const updateCompetitionById = useCallback((id: string, updates: Partial<Competition>) => {
    setCompetitions((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, []);

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

      const newGroup: ScoutGroup = { id: data.id, name: data.name, createdAt: data.created_at ?? new Date().toISOString() };

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

  const getScoutGroupName = useCallback((groupId: string) => scoutGroups.find((g) => g.id === groupId)?.name, [scoutGroups]);

  // ---------------------------
  // ✅ Templates (DB-kopplade)
  // ---------------------------

  const createScoutGroupTemplate = useCallback(async (name: string, groups: string[]) => {
    const trimmed = name.trim();
    const cleanedGroups = (groups ?? []).map((g) => g.trim()).filter(Boolean);

    if (!trimmed || cleanedGroups.length === 0) return;

    const { data, error } = await supabase
      .from("scout_group_templates")
      .insert({ name: trimmed, groups: cleanedGroups })
      .select("id,name,groups,created_at")
      .single();

    if (error || !data) {
      console.error("Kunde inte skapa template:", error);
      return;
    }

    const newTemplate: ScoutGroupTemplate = {
      id: data.id,
      name: data.name,
      groups: Array.isArray(data.groups) ? data.groups : [],
      createdAt: data.created_at ?? new Date().toISOString(),
    };

    setScoutGroupTemplates((prev) => [...prev, newTemplate].sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  const deleteScoutGroupTemplate = useCallback(async (id: string) => {
    const { error } = await supabase.from("scout_group_templates").delete().eq("id", id);
    if (error) {
      console.error("Kunde inte ta bort template:", error);
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
