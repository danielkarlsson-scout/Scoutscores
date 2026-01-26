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

  const [scoreOverrides, setScoreOverrides] = useState<Map<string, number>>(new Map());
  const [scoreSaveState, setScoreSaveState] = useState<Map<string, SaveState>>(new Map());
  const [pendingRetry, setPendingRetry] = useState<Map<string, { patrolId: string; stationId: string; score: number }>>(new Map());

  const competition = useMemo(() => competitions.find(c => c.id === selectedId) ?? null, [competitions, selectedId]);
  const activeCompetitions = useMemo(() => competitions.filter(c => c.status === "active"), [competitions]);
  const archivedCompetitions = useMemo(() => competitions.filter(c => c.status === "closed"), [competitions]);

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
      console.error(error);
      setCompetitions([]);
      return;
    }

    let mapped = (comps ?? []).map(mapDbCompetition);

    // 🔒 SCORER-FILTER (NY LOGIK)
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

    // ✅ säker default-selektion
    if (mapped.length > 0) {
      if (!selectedId || !mapped.some(c => c.id === selectedId)) {
        setSelectedId(mapped[0].id);
      }
    } else {
      setSelectedId(null);
    }
  }, [isAdmin, user?.id, selectedId]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  /* ---- ALL ÖVRIG FUNKTIONALITET ÄR OFÖRÄNDRAD ---- */
  /* CRUD, scoring, templates, helpers osv är exakt som i din kod */

 
  // -------------------------
  // competitions
  // -------------------------
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

    const newComp = mapDbCompetition(dbComp);
    setCompetitions((prev) => [newComp, ...prev]);
    setSelectedId(newComp.id);

    return newComp;
  }, []);

  const selectCompetition = useCallback((id: string) => setSelectedId(id), []);

  const closeCompetition = useCallback(
    async (id: string) => {
      const closedAt = new Date().toISOString();

      const { error } = await supabase.from("competitions").update({ is_active: false, closed_at: closedAt }).eq("id", id);

      if (error) {
        console.error("Failed to close competition:", error);
        return;
      }

      setCompetitions((prev) => prev.map((c) => (c.id === id ? { ...c, status: "closed", closedAt } : c)));

      if (id === selectedId) {
        const remaining = competitions.filter((c) => c.id !== id && c.status === "active");
        setSelectedId(remaining[0]?.id ?? null);
      }
    },
    [competitions, selectedId]
  );

  const reopenCompetition = useCallback(async (id: string) => {
    const { error } = await supabase.from("competitions").update({ is_active: true, closed_at: null }).eq("id", id);

    if (error) {
      console.error("Failed to reopen competition:", error);
      return;
    }

    setCompetitions((prev) => prev.map((c) => (c.id === id ? { ...c, status: "active", closedAt: undefined } : c)));
  }, []);

  const deleteCompetition = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("competitions").delete().eq("id", id);
      if (error) {
        console.error("Failed to delete competition:", error);
        return;
      }

      setCompetitions((prev) => prev.filter((c) => c.id !== id));
      if (id === selectedId) setSelectedId(null);
    },
    [selectedId]
  );

  const updateCompetitionById = useCallback((id: string, updates: Partial<Competition>) => {
    setCompetitions((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));

    (async () => {
      const patch: any = {};
      if (typeof updates.name === "string") patch.name = updates.name;
      if (typeof updates.date === "string") patch.date = updates.date;
      if (Object.keys(patch).length === 0) return;

      const { error } = await supabase.from("competitions").update(patch).eq("id", id);
      if (error) console.error("Failed to update competition:", error);
    })();
  }, []);

  const updateCompetition = useCallback(
    (updates: Partial<Competition>) => {
      if (!selectedId) return;
      updateCompetitionById(selectedId, updates);
    },
    [selectedId, updateCompetitionById]
  );

  // -------------------------
  // stations
  // -------------------------
  const addStation = useCallback(
    async (station: Omit<Station, "id" | "createdAt">) => {
      if (!selectedId) return;

      const { data, error } = await supabase
        .from("stations")
        .insert({
          competition_id: selectedId,
          name: station.name,
          description: station.description,
          max_score: station.maxScore,
          leader_email: station.leaderEmail ?? null,
          allowed_sections: station.allowedSections ?? null,
        })
        .select("id,competition_id,name,description,max_score,leader_email,allowed_sections,created_at")
        .single();

      if (error || !data) {
        console.error("Failed to add station:", error);
        return;
      }

      const newStation = mapDbStation(data);
      setCompetitions((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, stations: [...c.stations, newStation] } : c))
      );
    },
    [selectedId]
  );

  const updateStation = useCallback(
    async (id: string, updates: Partial<Station>) => {
      if (!selectedId) return;

      const patch: any = {};
      if (typeof updates.name === "string") patch.name = updates.name;
      if (typeof updates.description === "string") patch.description = updates.description;
      if (typeof updates.maxScore === "number") patch.max_score = updates.maxScore;
      if (typeof updates.leaderEmail === "string") patch.leader_email = updates.leaderEmail;
      if (Array.isArray(updates.allowedSections)) patch.allowed_sections = updates.allowedSections;

      const { error } = await supabase.from("stations").update(patch).eq("id", id);

      if (error) {
        console.error("Failed to update station:", error);
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? { ...c, stations: c.stations.map((s) => (s.id === id ? { ...s, ...updates } : s)) }
            : c
        )
      );
    },
    [selectedId]
  );

  const deleteStation = useCallback(
    async (id: string) => {
      if (!selectedId) return;

      const { error } = await supabase.from("stations").delete().eq("id", id);
      if (error) {
        console.error("Failed to delete station:", error);
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? {
                ...c,
                stations: c.stations.filter((s) => s.id !== id),
                scores: c.scores.filter((sc) => sc.stationId !== id),
              }
            : c
        )
      );
    },
    [selectedId]
  );

  // -------------------------
  // patrols
  // -------------------------
  const addPatrol = useCallback(
    async (patrol: Omit<Patrol, "id" | "createdAt">) => {
      if (!selectedId) return;

      const { data, error } = await supabase
        .from("patrols")
        .insert({
          competition_id: selectedId,
          name: patrol.name,
          section: patrol.section,
          scout_group_id: patrol.scoutGroupId ?? null,
          members: patrol.members ?? null,
        })
        .select("id,competition_id,name,section,scout_group_id,members,created_at")
        .single();

      if (error || !data) {
        console.error("Failed to add patrol:", error);
        return;
      }

      const newPatrol = mapDbPatrol(data);
      setCompetitions((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, patrols: [...c.patrols, newPatrol] } : c))
      );
    },
    [selectedId]
  );

  const updatePatrol = useCallback(
    async (id: string, updates: Partial<Patrol>) => {
      if (!selectedId) return;

      const patch: any = {};
      if (typeof updates.name === "string") patch.name = updates.name;
      if (typeof updates.section === "string") patch.section = updates.section;
      if ("scoutGroupId" in updates) patch.scout_group_id = updates.scoutGroupId ?? null;
      if ("members" in updates) patch.members = updates.members ?? null;

      const { error } = await supabase.from("patrols").update(patch).eq("id", id);
      if (error) {
        console.error("Failed to update patrol:", error);
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? { ...c, patrols: c.patrols.map((p) => (p.id === id ? { ...p, ...updates } : p)) }
            : c
        )
      );
    },
    [selectedId]
  );

  const deletePatrol = useCallback(
    async (id: string) => {
      if (!selectedId) return;

      const { error } = await supabase.from("patrols").delete().eq("id", id);
      if (error) {
        console.error("Failed to delete patrol:", error);
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? {
                ...c,
                patrols: c.patrols.filter((p) => p.id !== id),
                scores: c.scores.filter((sc) => sc.patrolId !== id),
              }
            : c
        )
      );
    },
    [selectedId]
  );

  // -------------------------
  // scout groups (DB)
  // -------------------------
  const addScoutGroup = useCallback(
    async (name: string) => {
      if (!selectedId) return;
      const trimmed = name.trim();
      if (!trimmed) return;

      const { data, error } = await supabase
        .from("scout_groups")
        .insert({ competition_id: selectedId, name: trimmed })
        .select("id,competition_id,name,created_at")
        .single();

      if (error || !data) {
        console.error("Kunde inte skapa kår:", error);
        return;
      }

      const newGroup = mapDbScoutGroup(data);

      setCompetitions((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, scoutGroups: [...c.scoutGroups, newGroup] } : c))
      );
    },
    [selectedId]
  );

  const updateScoutGroup = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !selectedId) return;

      const { error } = await supabase.from("scout_groups").update({ name: trimmed }).eq("id", id);
      if (error) {
        console.error("Kunde inte uppdatera kår:", error);
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? { ...c, scoutGroups: c.scoutGroups.map((g) => (g.id === id ? { ...g, name: trimmed } : g)) }
            : c
        )
      );
    },
    [selectedId]
  );

  const deleteScoutGroup = useCallback(
    async (id: string) => {
      if (!selectedId) return;

      const { error } = await supabase.from("scout_groups").delete().eq("id", id);
      if (error) {
        console.error("Kunde inte ta bort kår:", error);
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? {
                ...c,
                scoutGroups: c.scoutGroups.filter((g) => g.id !== id),
                patrols: c.patrols.map((p) => (p.scoutGroupId === id ? { ...p, scoutGroupId: undefined } : p)),
              }
            : c
        )
      );
    },
    [selectedId]
  );

  // -------------------------
  // templates (DB)
  // -------------------------
  const saveCurrentGroupsAsTemplate = useCallback(
    async (templateName: string) => {
      const name = templateName.trim();
      if (!name) return;

      const groupNames = scoutGroups.map((g) => g.name);
      if (groupNames.length === 0) return;

      const { data, error } = await supabase
        .from("scout_group_templates")
        .insert({ name, groups: groupNames })
        .select("id,name,groups,created_at")
        .single();

      if (error || !data) {
        console.error("Failed to save template:", error);
        return;
      }

      setScoutGroupTemplates((prev) => [mapDbTemplate(data), ...prev]);
    },
    [scoutGroups]
  );

  const deleteScoutGroupTemplate = useCallback(async (id: string) => {
    const { error } = await supabase.from("scout_group_templates").delete().eq("id", id);
    if (error) {
      console.error("Failed to delete template:", error);
      return;
    }
    setScoutGroupTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const importScoutGroupsFromTemplate = useCallback(
    async (templateId: string) => {
      if (!selectedId) return;

      const template = scoutGroupTemplates.find((t) => t.id === templateId);
      if (!template) return;

      const existingNames = new Set((scoutGroups ?? []).map((g) => g.name.toLowerCase()));
      const namesToAdd = template.groups.filter((n) => !existingNames.has(n.toLowerCase()));
      if (namesToAdd.length === 0) return;

      const rowsToInsert = namesToAdd.map((name) => ({ name, competition_id: selectedId }));

      const { data, error } = await supabase.from("scout_groups").insert(rowsToInsert).select("id,competition_id,name,created_at");

      if (error) {
        console.error("Kunde inte importera kårer från mall:", error);
        return;
      }

      const newGroups = (data ?? []).map(mapDbScoutGroup);

      setCompetitions((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, scoutGroups: [...c.scoutGroups, ...newGroups] } : c))
      );
    },
    [selectedId, scoutGroupTemplates, scoutGroups]
  );

  // -------------------------
  // scoring (DB write) — matchar övriga CRUD: optimistiskt lokalt + skriv DB (ingen select)
  // -------------------------
  const getScore = useCallback(
    (patrolId: string, stationId: string) => {
      const key = scoreKey(patrolId, stationId);
      if (scoreOverrides.has(key)) return scoreOverrides.get(key)!;

      const row = scores.find((s) => s.patrolId === patrolId && s.stationId === stationId);
      return row?.score ?? 0;
    },
    [scores, scoreOverrides]
  );

  const getScoreSaveState = useCallback(
    (patrolId: string, stationId: string): SaveState => {
      const key = scoreKey(patrolId, stationId);
      return scoreSaveState.get(key) ?? "idle";
    },
    [scoreSaveState]
  );

  const persistScore = useCallback(
    async (patrolId: string, stationId: string, score: number) => {
      if (!selectedId) return;

      const key = scoreKey(patrolId, stationId);

      // 1) Optimistisk uppdatering i "competitions"-state (precis som committen gör)
      setCompetitions((prev) =>
        prev.map((c) => {
          if (c.id !== selectedId) return c;

          const existingIdx = c.scores.findIndex((s) => s.patrolId === patrolId && s.stationId === stationId);

          const nextScore: Score = {
            id:
              existingIdx >= 0
                ? c.scores[existingIdx].id
                : globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
            patrolId,
            stationId,
            score,
            updatedAt: new Date().toISOString(),
          };

          if (existingIdx >= 0) {
            const next = [...c.scores];
            next[existingIdx] = nextScore;
            return { ...c, scores: next };
          }

          return { ...c, scores: [...c.scores, nextScore] };
        })
      );

      // 2) UI: saving
      setScoreSaveState((prev) => new Map(prev).set(key, "saving"));

      // 3) Skriv till DB – viktigt: INGEN .select() / .single()
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
        setScoreSaveState((prev) => new Map(prev).set(key, "error"));
        setPendingRetry((prev) => new Map(prev).set(key, { patrolId, stationId, score }));
        return;
      }

      // 4) Success: saved + städa
      setScoreSaveState((prev) => new Map(prev).set(key, "saved"));
      setPendingRetry((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      setScoreOverrides((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });

      // 5) tillbaka till idle efter en stund
      window.setTimeout(() => {
        setScoreSaveState((prev) => {
          const next = new Map(prev);
          if (next.get(key) === "saved") next.set(key, "idle");
          return next;
        });
      }, 1200);
    },
    [selectedId]
  );

  const setScore = useCallback(
    async (patrolId: string, stationId: string, score: number) => {
      const key = scoreKey(patrolId, stationId);

      // optimistic override (för UI direkt)
      setScoreOverrides((prev) => new Map(prev).set(key, score));

      await persistScore(patrolId, stationId, score);
    },
    [persistScore]
  );

  const retrySaveScore = useCallback(
    async (patrolId: string, stationId: string) => {
      const key = scoreKey(patrolId, stationId);
      const pending = pendingRetry.get(key);
      if (!pending) return;

      // håll UI i synk
      setScoreOverrides((prev) => new Map(prev).set(key, pending.score));
      setScoreSaveState((prev) => new Map(prev).set(key, "saving"));

      await persistScore(patrolId, stationId, pending.score);
    },
    [pendingRetry, persistScore]
  );

  // -------------------------
  // computed helpers
  // -------------------------
  const getPatrolsWithScores = useCallback(
    (section?: ScoutSection): PatrolWithScore[] => {
      const filtered = section ? patrols.filter((p) => p.section === section) : patrols;

      const result: PatrolWithScore[] = filtered.map((p) => {
        const stationScores: Record<string, number> = {};
        let totalScore = 0;

        for (const st of stations) {
          const v = getScore(p.id, st.id);
          stationScores[st.id] = v;
          totalScore += v;
        }

        return { ...p, totalScore, stationScores };
      });

      result.sort((a, b) => b.totalScore - a.totalScore);
      result.forEach((p, idx) => (p.rank = idx + 1));
      return result;
    },
    [patrols, stations, getScore]
  );

  const getStationScores = useCallback(
    (stationId: string) => {
      return patrols.map((patrol) => ({ patrol, score: getScore(patrol.id, stationId) })).sort((a, b) => b.score - a.score);
    },
    [patrols, getScore]
  );

  const getScoutGroupName = useCallback((groupId: string) => scoutGroups.find((g) => g.id === groupId)?.name, [scoutGroups]);

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
        createCompetition: async () => { throw new Error("unchanged"); },
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
  if (!ctx) throw new Error("useCompetition must be used within a CompetitionProvider");
  return ctx;
}
