import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
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

  // Station actions (DB)
  addStation: (station: Omit<Station, "id" | "createdAt">) => Promise<void>;
  updateStation: (id: string, updates: Partial<Station>) => Promise<void>;
  deleteStation: (id: string) => Promise<void>;

  // Patrol actions (DB) ✅
  addPatrol: (patrol: Omit<Patrol, "id" | "createdAt">) => Promise<void>;
  updatePatrol: (id: string, updates: Partial<Patrol>) => Promise<void>;
  deletePatrol: (id: string) => Promise<void>;

  // Scout Group actions (DB-kopplade)
  addScoutGroup: (name: string) => Promise<void>;
  updateScoutGroup: (id: string, name: string) => Promise<void>;
  deleteScoutGroup: (id: string) => Promise<void>;
  importScoutGroupsFromTemplate: (templateId: string) => Promise<void>;

  // Scout Group Template actions (DB)
  scoutGroupTemplates: ScoutGroupTemplate[];
  createScoutGroupTemplate: (name: string, groups: string[]) => Promise<void>;
  deleteScoutGroupTemplate: (id: string) => Promise<void>;
  saveCurrentGroupsAsTemplate: (templateName: string) => Promise<void>;

  // Score actions (lokalt – fortfarande bara i minnet)
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

export function CompetitionProvider({ children }: { children: React.ReactNode }) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [scoutGroupTemplates, setScoutGroupTemplates] = useState<ScoutGroupTemplate[]>([]);

  // Derived state
  const competition = competitions.find((c) => c.id === selectedId) ?? null;
  const activeCompetitions = competitions.filter((c) => c.status === "active");
  const archivedCompetitions = competitions.filter((c) => c.status === "closed");
  const stations = competition?.stations ?? [];
  const patrols = competition?.patrols ?? [];
  const scores = competition?.scores ?? [];
  const scoutGroups = competition?.scoutGroups ?? [];

  // Helper to update current competition
  const updateCurrentCompetition = useCallback(
    (updater: (comp: Competition) => Competition) => {
      if (!selectedId) return;
      setCompetitions((prev) => prev.map((c) => (c.id === selectedId ? updater(c) : c)));
    },
    [selectedId]
  );

  // 🔹 Hämta tävlingar från DB
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("competitions")
        .select("id,name,date,is_active")
        .order("date", { ascending: true });

      if (error) {
        console.error("Kunde inte hämta tävlingar:", error);
        return;
      }

      const mapped: Competition[] = (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        date: row.date,
        status: row.is_active ? ("active" as CompetitionStatus) : ("closed" as CompetitionStatus),
        stations: [],
        patrols: [],
        scores: [],
        scoutGroups: [],
        createdAt: new Date().toISOString(),
      }));

      setCompetitions(mapped);

      if (!selectedId) {
        const firstActive = mapped.find((c) => c.status === "active") ?? mapped[0];
        setSelectedId(firstActive?.id ?? null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🔹 Hämta mallar från DB
  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from("scout_group_templates")
        .select("id,name,groups,created_at")
        .order("name", { ascending: true });

      if (error) {
        console.error("Kunde inte hämta mallar:", error);
        return;
      }

      const templates: ScoutGroupTemplate[] = (data ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        groups: t.groups ?? [],
        createdAt: t.created_at ?? new Date().toISOString(),
      }));

      setScoutGroupTemplates(templates);
    })();
  }, []);

  // 🔹 Hämta kårer för vald tävling
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

  // 🔹 Hämta stationer för vald tävling (DB)
  useEffect(() => {
    if (!selectedId) return;

    (async () => {
      const { data, error } = await (supabase as any)
        .from("stations")
        .select(
          "id,name,description,max_score,leader_email,allowed_sections,created_at,competition_id"
        )
        .eq("competition_id", selectedId)
        .order("name", { ascending: true });

      if (error) {
        console.error("Kunde inte hämta stationer från databasen:", error);
        return;
      }

      const dbStations: Station[] = (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? "",
        maxScore: row.max_score ?? 0,
        leaderEmail: row.leader_email ?? undefined,
        allowedSections: row.allowed_sections ?? undefined,
        createdAt: row.created_at ?? new Date().toISOString(),
      }));

      setCompetitions((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, stations: dbStations } : c))
      );
    })();
  }, [selectedId]);

  // 🔹 Hämta patruller för vald tävling (DB) ✅
  useEffect(() => {
    if (!selectedId) return;

    (async () => {
      const { data, error } = await (supabase as any)
        .from("patrols")
        .select(
          "id,name,section,scout_group_id,members,created_at,competition_id"
        )
        .eq("competition_id", selectedId)
        .order("name", { ascending: true });

      if (error) {
        console.error("Kunde inte hämta patruller från databasen:", error);
        return;
      }

      const dbPatrols: Patrol[] = (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        section: row.section as ScoutSection,
        scoutGroupId: row.scout_group_id ?? undefined,
        members: row.members ?? undefined,
        createdAt: row.created_at ?? new Date().toISOString(),
      }));

      setCompetitions((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, patrols: dbPatrols } : c))
      );
    })();
  }, [selectedId]);

  // Competition management
  const createCompetition = useCallback(
    async (data: { name: string; date: string }): Promise<Competition> => {
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
        date: dbComp.date,
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
    },
    []
  );

  const selectCompetition = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const closeCompetition = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("competitions")
        .update({ is_active: false })
        .eq("id", id);

      if (error) {
        console.error("Kunde inte arkivera tävling:", error);
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, status: "closed" as CompetitionStatus, closedAt: new Date().toISOString() }
            : c
        )
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
      .update({ is_active: true })
      .eq("id", id);

    if (error) {
      console.error("Kunde inte återaktivera tävling:", error);
      return;
    }

    setCompetitions((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, status: "active" as CompetitionStatus, closedAt: undefined } : c
      )
    );
  }, []);

  const deleteCompetition = useCallback(
    async (id: string) => {
      // OBS: säkerställ FK / cascade i DB om patruller/stationer/kårer är kopplade
      const { error } = await supabase.from("competitions").delete().eq("id", id);
      if (error) {
        console.error("Kunde inte ta bort tävling:", error);
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
    setCompetitions((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, []);

  // Station actions (DB)
  const addStation = useCallback(
    async (station: Omit<Station, "id" | "createdAt">) => {
      if (!selectedId) return;

      const payload: any = {
        competition_id: selectedId,
        name: station.name,
        description: station.description ?? "",
        max_score: station.maxScore ?? 0,
        leader_email: station.leaderEmail ?? null,
        allowed_sections: station.allowedSections ?? null,
      };

      const { data, error } = await (supabase as any)
        .from("stations")
        .insert(payload)
        .select("id,name,description,max_score,leader_email,allowed_sections,created_at")
        .single();

      if (error || !data) {
        console.error("Kunde inte skapa station:", error);
        return;
      }

      const newStation: Station = {
        id: data.id,
        name: data.name,
        description: data.description ?? "",
        maxScore: data.max_score ?? 0,
        leaderEmail: data.leader_email ?? undefined,
        allowedSections: data.allowed_sections ?? undefined,
        createdAt: data.created_at ?? new Date().toISOString(),
      };

      updateCurrentCompetition((comp) => ({
        ...comp,
        stations: [...(comp.stations ?? []), newStation],
      }));
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
      if (updates.allowedSections !== undefined)
        payload.allowed_sections = updates.allowedSections ?? null;

      const { error } = await (supabase as any).from("stations").update(payload).eq("id", id);
      if (error) {
        console.error("Kunde inte uppdatera station:", error);
        return;
      }

      updateCurrentCompetition((comp) => ({
        ...comp,
        stations: (comp.stations ?? []).map((s) => (s.id === id ? { ...s, ...updates } : s)),
      }));
    },
    [updateCurrentCompetition]
  );

  const deleteStation = useCallback(
    async (id: string) => {
      const { error } = await (supabase as any).from("stations").delete().eq("id", id);
      if (error) {
        console.error("Kunde inte ta bort station:", error);
        return;
      }

      updateCurrentCompetition((comp) => ({
        ...comp,
        stations: (comp.stations ?? []).filter((s) => s.id !== id),
        scores: (comp.scores ?? []).filter((sc) => sc.stationId !== id),
      }));
    },
    [updateCurrentCompetition]
  );

  // ✅ Patrol actions (DB)
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

      const { data, error } = await (supabase as any)
        .from("patrols")
        .insert(payload)
        .select("id,name,section,scout_group_id,members,created_at")
        .single();

      if (error || !data) {
        console.error("Kunde inte skapa patrull:", error);
        return;
      }

      const newPatrol: Patrol = {
        id: data.id,
        name: data.name,
        section: data.section as ScoutSection,
        scoutGroupId: data.scout_group_id ?? undefined,
        members: data.members ?? undefined,
        createdAt: data.created_at ?? new Date().toISOString(),
      };

      updateCurrentCompetition((comp) => ({
        ...comp,
        patrols: [...(comp.patrols ?? []), newPatrol],
      }));
    },
    [selectedId, updateCurrentCompetition]
  );

  const updatePatrol = useCallback(
    async (id: string, updates: Partial<Patrol>) => {
      const payload: any = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.section !== undefined) payload.section = updates.section;
      if (updates.scoutGroupId !== undefined)
        payload.scout_group_id = updates.scoutGroupId ?? null;
      if (updates.members !== undefined) payload.members = updates.members ?? null;

      const { error } = await (supabase as any).from("patrols").update(payload).eq("id", id);
      if (error) {
        console.error("Kunde inte uppdatera patrull:", error);
        return;
      }

      updateCurrentCompetition((comp) => ({
        ...comp,
        patrols: (comp.patrols ?? []).map((p) => (p.id === id ? { ...p, ...updates } : p)),
      }));
    },
    [updateCurrentCompetition]
  );

  const deletePatrol = useCallback(
    async (id: string) => {
      const { error } = await (supabase as any).from("patrols").delete().eq("id", id);
      if (error) {
        console.error("Kunde inte ta bort patrull:", error);
        return;
      }

      updateCurrentCompetition((comp) => ({
        ...comp,
        patrols: (comp.patrols ?? []).filter((p) => p.id !== id),
        scores: (comp.scores ?? []).filter((s) => s.patrolId !== id),
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
        patrols: comp.patrols.map((p) =>
          p.scoutGroupId === id ? { ...p, scoutGroupId: undefined } : p
        ),
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

  // Templates (DB)
  const createScoutGroupTemplate = useCallback(
    async (name: string, groups: string[]) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      const { error } = await (supabase as any)
        .from("scout_group_templates")
        .insert({ name: trimmed, groups });

      if (error) {
        console.error("Kunde inte skapa mall:", error);
        return;
      }

      const { data, error: reloadErr } = await (supabase as any)
        .from("scout_group_templates")
        .select("id,name,groups,created_at")
        .order("name", { ascending: true });

      if (reloadErr) {
        console.error("Kunde inte ladda om mallar:", reloadErr);
        return;
      }

      setScoutGroupTemplates(
        (data ?? []).map((t: any) => ({
          id: t.id,
          name: t.name,
          groups: t.groups ?? [],
          createdAt: t.created_at ?? new Date().toISOString(),
        }))
      );
    },
    []
  );

  const deleteScoutGroupTemplate = useCallback(
    async (id: string) => {
      const { error } = await (supabase as any)
        .from("scout_group_templates")
        .delete()
        .eq("id", id);
      if (error) {
        console.error("Kunde inte ta bort mall:", error);
        return;
      }

      setScoutGroupTemplates((prev) => prev.filter((t) => t.id !== id));
    },
    []
  );

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

      const rowsToInsert = namesToAdd.map((name) => ({
        name,
        competition_id: selectedId,
      }));

      const { data, error } = await supabase
        .from("scout_groups")
        .insert(rowsToInsert)
        .select("id,name,created_at");

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

  // Scores – fortfarande endast lokalt
  const setScore = useCallback(
    (patrolId: string, stationId: string, score: number) => {
      updateCurrentCompetition((comp) => {
        const existingIndex = comp.scores.findIndex(
          (s) => s.patrolId === patrolId && s.stationId === stationId
        );

        const newScore: Score = {
          id:
            existingIndex >= 0
              ? comp.scores[existingIndex].id
              : Math.random().toString(36).slice(2),
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
      const scoreRecord = scores.find(
        (s) => s.patrolId === patrolId && s.stationId === stationId
      );
      return scoreRecord?.score ?? 0;
    },
    [scores]
  );

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
          const scoreRecord = scores.find(
            (s) => s.patrolId === patrol.id && s.stationId === stationId
          );
          return {
            patrol,
            score: scoreRecord?.score ?? 0,
          };
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
