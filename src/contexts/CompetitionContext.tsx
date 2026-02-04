import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Competition,
  CompetitionStatus,
  Patrol,
  PatrolWithScore,
  Score,
  ScoutGroup,
  ScoutGroupTemplate,
  Station,
} from "@/types/competition";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type SaveState = "idle" | "saving" | "saved" | "error";

interface CompetitionContextType {
  competitions: Competition[];
  activeCompetitions: Competition[];
  archivedCompetitions: Competition[];

  selectableCompetitions: Competition[];
  scorerActiveCompetitions: Competition[];
  allowedCompetitionIds: string[];
  canSelectCompetition: (competitionId: string) => boolean;

  competition: Competition | null;
  stations: Station[];
  patrols: Patrol[];
  scores: Score[];
  scoutGroups: ScoutGroup[];

  scoutGroupTemplates: ScoutGroupTemplate[];

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
  deleteScoutGroup: (id: string) => Promise<void>;
  renameScoutGroup: (id: string, name: string) => Promise<void>;

  movePatrolToGroup: (patrolId: string, groupId: string | undefined) => void;

  addScoutGroupTemplate: (name: string) => Promise<void>;
  applyScoutGroupTemplate: (templateId: string) => Promise<void>;
  deleteScoutGroupTemplate: (id: string) => Promise<void>;

  setScore: (patrolId: string, stationId: string, score: number) => Promise<void>;
  getScore: (patrolId: string, stationId: string) => number;
  getScoreSaveState: (patrolId: string, stationId: string) => SaveState;
  retrySaveScore: (patrolId: string, stationId: string) => Promise<void>;

  getPatrolsWithScores: (section?: ScoutSection) => PatrolWithScore[];
  getStationScores: (
    stationId: string
  ) => Array<{ patrol: Patrol; score: number }>;
  getScoutGroupName: (groupId: string) => string | undefined;

  updateCompetition: (updates: Partial<Competition>) => void;
}

import { ScoutSection } from "@/types/competition";

const CompetitionContext =
  createContext<CompetitionContextType | undefined>(undefined);

const SELECTED_KEY = "scout-selected-competition";
const AUTH_SELECTED_KEY = "selectedCompetitionId";

const scoreKey = (patrolId: string, stationId: string) =>
  `${patrolId}:${stationId}`;

function mapDbCompetition(row: any): Competition {
  const status: CompetitionStatus = row.is_active ? "active" : "closed";
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    status,
    createdAt: row.created_at ?? new Date().toISOString(),
    closedAt: row.closed_at ?? undefined,
    stations: [],
    patrols: [],
    scores: [],
    scoutGroups: [],
  };
}

function mapDbStation(row: any): Station {
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
    score: row.score ?? 0,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapDbScoutGroup(row: any): ScoutGroup {
  return {
    id: row.id,
    name: row.name,
    competitionId: row.competition_id,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapDbScoutGroupTemplate(row: any): ScoutGroupTemplate {
  return {
    id: row.id,
    name: row.name,
    groups: row.groups ?? [],
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function readSelectedCompetitionId(): string | null {
  try {
    return (
      localStorage.getItem(SELECTED_KEY) ||
      localStorage.getItem(AUTH_SELECTED_KEY) ||
      null
    );
  } catch {
    return null;
  }
}

function writeSelectedCompetitionId(id: string | null) {
  try {
    if (id) {
      localStorage.setItem(SELECTED_KEY, id);
      localStorage.setItem(AUTH_SELECTED_KEY, id);
    } else {
      localStorage.removeItem(SELECTED_KEY);
      localStorage.removeItem(AUTH_SELECTED_KEY);
    }

    // Samma flik får ingen "storage"-event – signalera manuellt.
    window.dispatchEvent(new Event("scout:selected-competition-changed"));
  } catch {
    // ignore
  }
}

export function CompetitionProvider({ children }: { children: React.ReactNode }) {
  const { user, isGlobalAdmin } = useAuth();

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [adminCompetitionIds, setAdminCompetitionIds] = useState<string[]>([]);
  const [scorerCompetitionIds, setScorerCompetitionIds] = useState<string[]>([]);

  const isAnyCompetitionAdmin = adminCompetitionIds.length > 0;
  const isAnyAdmin = isGlobalAdmin || isAnyCompetitionAdmin;

  const [selectedId, setSelectedId] = useState<string | null>(() =>
    readSelectedCompetitionId()
  );

  const [scoutGroupTemplates, setScoutGroupTemplates] = useState<
    ScoutGroupTemplate[]
  >([]);

  const [scoreOverrides, setScoreOverrides] = useState<Map<string, number>>(
    new Map()
  );
  const [scoreSaveState, setScoreSaveState] = useState<Map<string, SaveState>>(
    new Map()
  );
  const [pendingRetry, setPendingRetry] = useState<
    Map<string, { patrolId: string; stationId: string; score: number }>
  >(new Map());

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

  const selectableCompetitions = useMemo(() => {
    if (isGlobalAdmin) return activeCompetitions;

    if (isAnyCompetitionAdmin) {
      const allowed = new Set(adminCompetitionIds.map(String));
      return activeCompetitions.filter((c) => allowed.has(c.id));
    }

    const allowed = new Set(scorerCompetitionIds.map(String));
    return activeCompetitions.filter((c) => allowed.has(c.id));
  }, [
    isGlobalAdmin,
    isAnyCompetitionAdmin,
    adminCompetitionIds,
    scorerCompetitionIds,
    activeCompetitions,
  ]);

  const scorerActiveCompetitions = useMemo(
    () =>
      activeCompetitions.filter((c) =>
        scorerCompetitionIds.map(String).includes(String(c.id))
      ),
    [activeCompetitions, scorerCompetitionIds]
  );

  const allowedCompetitionIds = useMemo(() => {
    if (isGlobalAdmin) return competitions.map((c) => c.id);
    if (isAnyCompetitionAdmin) return adminCompetitionIds.map(String);
    return scorerCompetitionIds.map(String);
  }, [
    isGlobalAdmin,
    isAnyCompetitionAdmin,
    adminCompetitionIds,
    scorerCompetitionIds,
    competitions,
  ]);

  const canSelectCompetition = useCallback(
    (competitionId: string) => {
      if (isGlobalAdmin) return true;

      if (isAnyCompetitionAdmin) {
        return adminCompetitionIds
          .map(String)
          .includes(String(competitionId));
      }

      return scorerCompetitionIds.map(String).includes(String(competitionId));
    },
    [
      isGlobalAdmin,
      isAnyCompetitionAdmin,
      adminCompetitionIds,
      scorerCompetitionIds,
    ]
  );

  const stations = competition?.stations ?? [];
  const patrols = competition?.patrols ?? [];
  const scores = competition?.scores ?? [];
  const scoutGroups = competition?.scoutGroups ?? [];

  useEffect(() => {
    writeSelectedCompetitionId(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SELECTED_KEY || e.key === AUTH_SELECTED_KEY) {
        setSelectedId(readSelectedCompetitionId());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // auto-val / validering av vald tävling
  useEffect(() => {
    if (isGlobalAdmin) {
      if (!selectedId) {
        if (activeCompetitions.length > 0) setSelectedId(activeCompetitions[0].id);
        else if (archivedCompetitions.length > 0)
          setSelectedId(archivedCompetitions[0].id);
      } else if (!competitions.some((c) => c.id === selectedId)) {
        if (activeCompetitions.length > 0) setSelectedId(activeCompetitions[0].id);
        else if (archivedCompetitions.length > 0)
          setSelectedId(archivedCompetitions[0].id);
        else setSelectedId(null);
      }
    } else {
      if (!selectedId) {
        if (selectableCompetitions.length > 0)
          setSelectedId(selectableCompetitions[0].id);
      } else if (!selectableCompetitions.some((c) => c.id === selectedId)) {
        if (selectableCompetitions.length > 0)
          setSelectedId(selectableCompetitions[0].id);
        else setSelectedId(null);
      }
    }
  }, [
    isGlobalAdmin,
    competitions,
    activeCompetitions,
    archivedCompetitions,
    selectableCompetitions,
    selectedId,
  ]);

  const refreshAll = useCallback(async () => {
    if (!user) {
      setCompetitions([]);
      setAdminCompetitionIds([]);
      setScorerCompetitionIds([]);
      return;
    }

    // 1) competitions
    const { data: comps, error: compsErr } = await supabase
      .from("competitions")
      .select("id,name,date,is_active,created_at,closed_at")
      .order("created_at", { ascending: false });

    if (compsErr) {
      console.error("Failed to load competitions:", compsErr);
      setCompetitions([]);
      setAdminCompetitionIds([]);
      setScorerCompetitionIds([]);
      return;
    }

    const mapped = (comps ?? []).map(mapDbCompetition);

    // 1.1) roller
    const adminIds: string[] = [];
    const scorerIds: string[] = [];

    const { data: roleRows, error: rolesErr } = await supabase
      .from("user_competition_roles")
      .select("competition_id, role");

    if (rolesErr) {
      console.error("Failed to load user_competition_roles:", rolesErr);
    } else {
      for (const row of roleRows ?? []) {
        const cid = String((row as any).competition_id);
        const role = (row as any).role;
        if (role === "admin") adminIds.push(cid);
        if (role === "scorer") scorerIds.push(cid);
      }
    }

    setAdminCompetitionIds(adminIds);
    setScorerCompetitionIds(scorerIds);

    // 2) vilka tävlingar vi får hämta data för
    let idsToFetch: string[] = [];

    if (isGlobalAdmin) {
      idsToFetch = mapped.map((c) => c.id);
    } else if (adminIds.length > 0) {
      const allowed = new Set(adminIds);
      idsToFetch = mapped.filter((c) => allowed.has(c.id)).map((c) => c.id);
    } else {
      const allowed = new Set(scorerIds);
      idsToFetch = mapped
        .filter((c) => c.status === "active" && allowed.has(c.id))
        .map((c) => c.id);
    }

    if (idsToFetch.length === 0) {
      setCompetitions(mapped);
      return;
    }

    const { data: stationsRows, error: stationsErr } = await supabase
      .from("stations")
      .select("*")
      .in("competition_id", idsToFetch);

    if (stationsErr) {
      console.error("Failed to load stations:", stationsErr);
    }

    const { data: patrolRows, error: patrolsErr } = await supabase
      .from("patrols")
      .select("*")
      .in("competition_id", idsToFetch);

    if (patrolsErr) {
      console.error("Failed to load patrols:", patrolsErr);
    }

    const { data: scoreRows, error: scoresErr } = await supabase
      .from("scores")
      .select("*")
      .in("competition_id", idsToFetch);

    if (scoresErr) {
      console.error("Failed to load scores:", scoresErr);
    }

    const { data: groupRows, error: groupsErr } = await supabase
      .from("scout_groups")
      .select("*")
      .in("competition_id", idsToFetch);

    if (groupsErr) {
      console.error("Failed to load scout_groups:", groupsErr);
    }

    const stationsByComp = new Map<string, Station[]>();
    for (const row of stationsRows ?? []) {
      const cid = String((row as any).competition_id);
      const station = mapDbStation(row);
      stationsByComp.set(cid, [...(stationsByComp.get(cid) ?? []), station]);
    }

    const patrolsByComp = new Map<string, Patrol[]>();
    for (const row of patrolRows ?? []) {
      const cid = String((row as any).competition_id);
      const patrol = mapDbPatrol(row);
      patrolsByComp.set(cid, [...(patrolsByComp.get(cid) ?? []), patrol]);
    }

    const scoresByComp = new Map<string, Score[]>();
    for (const row of scoreRows ?? []) {
      const cid = String((row as any).competition_id);
      const score = mapDbScore(row);
      scoresByComp.set(cid, [...(scoresByComp.get(cid) ?? []), score]);
    }

    const groupsByComp = new Map<string, ScoutGroup[]>();
    for (const row of groupRows ?? []) {
      const cid = String((row as any).competition_id);
      const group = mapDbScoutGroup(row);
      groupsByComp.set(cid, [...(groupsByComp.get(cid) ?? []), group]);
    }

    setCompetitions(
      mapped.map((c) => ({
        ...c,
        stations: stationsByComp.get(c.id) ?? [],
        patrols: patrolsByComp.get(c.id) ?? [],
        scores: scoresByComp.get(c.id) ?? [],
        scoutGroups: groupsByComp.get(c.id) ?? [],
      }))
    );
  }, [user, isGlobalAdmin]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const selectCompetition = useCallback(
    (id: string) => {
      if (!canSelectCompetition(id)) return;
      setSelectedId(id);
    },
    [canSelectCompetition]
  );

  const closeCompetition = useCallback(
    async (id: string) => {
      await supabase
        .from("competitions")
        .update({ is_active: false, closed_at: new Date().toISOString() })
        .eq("id", id);

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status: "closed", closedAt: new Date().toISOString() } : c
        )
      );
    },
    []
  );

  const reopenCompetition = useCallback(
    async (id: string) => {
      await supabase
        .from("competitions")
        .update({ is_active: true, closed_at: null })
        .eq("id", id);

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status: "active", closedAt: undefined } : c
        )
      );
    },
    []
  );

  const deleteCompetition = useCallback(
    async (id: string) => {
      await supabase.from("competitions").delete().eq("id", id);
      setCompetitions((prev) => prev.filter((c) => c.id !== id));
    },
    []
  );

  const updateCompetitionById = useCallback(
    (id: string, updates: Partial<Competition>) => {
      setCompetitions((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
      );
    },
    []
  );

  const addStation = useCallback(
    async (station: Omit<Station, "id" | "createdAt">) => {
      if (!competition) return;
      const { data, error } = await supabase
        .from("stations")
        .insert({
          competition_id: competition.id,
          name: station.name,
          description: station.description,
          max_score: station.maxScore,
          leader_email: station.leaderEmail,
          allowed_sections: station.allowedSections,
        })
        .select()
        .single();

      if (error) {
        console.error("Failed to add station:", error);
        return;
      }

      const newStation = mapDbStation(data);

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === competition.id
            ? { ...c, stations: [...c.stations, newStation] }
            : c
        )
      );
    },
    [competition]
  );

  const updateStation = useCallback(
    async (id: string, updates: Partial<Station>) => {
      if (!competition) return;

      const patch: any = {};
      if (updates.name !== undefined) patch.name = updates.name;
      if (updates.description !== undefined)
        patch.description = updates.description;
      if (updates.maxScore !== undefined) patch.max_score = updates.maxScore;
      if (updates.leaderEmail !== undefined)
        patch.leader_email = updates.leaderEmail;
      if (updates.allowedSections !== undefined)
        patch.allowed_sections = updates.allowedSections;

      if (Object.keys(patch).length === 0) return;

      const { error } = await supabase
        .from("stations")
        .update(patch)
        .eq("id", id)
        .eq("competition_id", competition.id);

      if (error) {
        console.error("Failed to update station:", error);
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === competition.id
            ? {
                ...c,
                stations: c.stations.map((s) =>
                  s.id === id ? { ...s, ...updates } : s
                ),
              }
            : c
        )
      );
    },
    [competition]
  );

  const deleteStation = useCallback(
    async (id: string) => {
      if (!competition) return;

      const { error } = await supabase
        .from("stations")
        .delete()
        .eq("id", id)
        .eq("competition_id", competition.id);

      if (error) {
        console.error("Failed to delete station:", error);
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === competition.id
            ? {
                ...c,
                stations: c.stations.filter((s) => s.id !== id),
                scores: c.scores.filter((sc) => sc.stationId !== id),
              }
            : c
        )
      );
    },
    [competition]
  );

  const addPatrol = useCallback(
    async (patrol: Omit<Patrol, "id" | "createdAt">) => {
      if (!competition) return;

      const { data, error } = await supabase
        .from("patrols")
        .insert({
          competition_id: competition.id,
          name: patrol.name,
          section: patrol.section,
          scout_group_id: patrol.scoutGroupId,
          members: patrol.members,
        })
        .select()
        .single();

      if (error) {
        console.error("Failed to add patrol:", error);
        return;
      }

      const newPatrol = mapDbPatrol(data);

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === competition.id
            ? { ...c, patrols: [...c.patrols, newPatrol] }
            : c
        )
      );
    },
    [competition]
  );

  const updatePatrol = useCallback(
    async (id: string, updates: Partial<Patrol>) => {
      if (!competition) return;

      const patch: any = {};
      if (updates.name !== undefined) patch.name = updates.name;
      if (updates.section !== undefined) patch.section = updates.section;
      if (updates.scoutGroupId !== undefined)
        patch.scout_group_id = updates.scoutGroupId;
      if (updates.members !== undefined) patch.members = updates.members;

      if (Object.keys(patch).length === 0) return;

      const { error } = await supabase
        .from("patrols")
        .update(patch)
        .eq("id", id)
        .eq("competition_id", competition.id);

      if (error) {
        console.error("Failed to update patrol:", error);
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === competition.id
            ? {
                ...c,
                patrols: c.patrols.map((p) =>
                  p.id === id ? { ...p, ...updates } : p
                ),
              }
            : c
        )
      );
    },
    [competition]
  );

  const deletePatrol = useCallback(
    async (id: string) => {
      if (!competition) return;

      const { error } = await supabase
        .from("patrols")
        .delete()
        .eq("id", id)
        .eq("competition_id", competition.id);

      if (error) {
        console.error("Failed to delete patrol:", error);
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === competition.id
            ? {
                ...c,
                patrols: c.patrols.filter((p) => p.id !== id),
                scores: c.scores.filter((sc) => sc.patrolId !== id),
              }
            : c
        )
      );
    },
    [competition]
  );

  const addScoutGroup = useCallback(
    async (name: string) => {
      if (!competition) return;

      const { data, error } = await supabase
        .from("scout_groups")
        .insert({
          competition_id: competition.id,
          name,
        })
        .select()
        .single();

      if (error) {
        console.error("Failed to add scout group:", error);
        return;
      }

      const group = mapDbScoutGroup(data);

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === competition.id
            ? { ...c, scoutGroups: [...c.scoutGroups, group] }
            : c
        )
      );
    },
    [competition]
  );

  const deleteScoutGroup = useCallback(
    async (id: string) => {
      if (!competition) return;

      const { error } = await supabase
        .from("scout_groups")
        .delete()
        .eq("id", id)
        .eq("competition_id", competition.id);

      if (error) {
        console.error("Failed to delete scout group:", error);
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === competition.id
            ? {
                ...c,
                scoutGroups: c.scoutGroups.filter((g) => g.id !== id),
                patrols: c.patrols.map((p) =>
                  p.scoutGroupId === id ? { ...p, scoutGroupId: undefined } : p
                ),
              }
            : c
        )
      );
    },
    [competition]
  );

  const renameScoutGroup = useCallback(
    async (id: string, name: string) => {
      if (!competition) return;

      const { error } = await supabase
        .from("scout_groups")
        .update({ name })
        .eq("id", id)
        .eq("competition_id", competition.id);

      if (error) {
        console.error("Failed to rename scout group:", error);
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === competition.id
            ? {
                ...c,
                scoutGroups: c.scoutGroups.map((g) =>
                  g.id === id ? { ...g, name } : g
                ),
              }
            : c
        )
      );
    },
    [competition]
  );

  const movePatrolToGroup = useCallback(
    (patrolId: string, groupId: string | undefined) => {
      if (!competition) return;

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === competition.id
            ? {
                ...c,
                patrols: c.patrols.map((p) =>
                  p.id === patrolId ? { ...p, scoutGroupId: groupId } : p
                ),
              }
            : c
        )
      );
    },
    [competition]
  );

  const addScoutGroupTemplate = useCallback(
    async (name: string) => {
      if (!competition) return;

      const { data, error } = await supabase
        .from("scout_group_templates")
        .insert({
          name,
          groups: competition.scoutGroups.map((g) => g.name),
        })
        .select()
        .single();

      if (error) {
        console.error("Failed to add scout group template:", error);
        return;
      }

      const template = mapDbScoutGroupTemplate(data);
      setScoutGroupTemplates((prev) => [...prev, template]);
    },
    [competition]
  );

  const applyScoutGroupTemplate = useCallback(
    async (templateId: string) => {
      if (!competition) return;

      const template = scoutGroupTemplates.find((t) => t.id === templateId);
      if (!template) return;

      const groupNames = template.groups ?? [];
      if (groupNames.length === 0) return;

      const namesToAdd = groupNames.filter(
        (name) => !competition.scoutGroups.some((g) => g.name === name)
      );
      if (namesToAdd.length === 0) return;

      const { data, error } = await supabase
        .from("scout_groups")
        .insert(
          namesToAdd.map((name) => ({
            competition_id: competition.id,
            name,
          }))
        )
        .select();

      if (error) {
        console.error("Failed to apply scout group template:", error);
        return;
      }

      const newGroups = (data ?? []).map(mapDbScoutGroup);

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === competition.id
            ? { ...c, scoutGroups: [...c.scoutGroups, ...newGroups] }
            : c
        )
      );
    },
    [competition, scoutGroupTemplates]
  );

  const deleteScoutGroupTemplate = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("scout_group_templates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Failed to delete scout group template:", error);
      return;
    }

    setScoutGroupTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const setScore = useCallback(
    async (patrolId: string, stationId: string, score: number) => {
      if (!competition) return;

      const key = scoreKey(patrolId, stationId);

      setScoreOverrides((prev) => new Map(prev).set(key, score));
      setScoreSaveState((prev) => new Map(prev).set(key, "saving"));

      const existing = scores.find(
        (s) => s.patrolId === patrolId && s.stationId === stationId
      );

      if (existing) {
        const { error } = await supabase
          .from("scores")
          .update({ score })
          .eq("id", existing.id);

        if (error) {
          console.error("Failed to update score:", error);
          setScoreSaveState((prev) => new Map(prev).set(key, "error"));
          return;
        }
      } else {
        const { data, error } = await supabase
          .from("scores")
          .insert({
            competition_id: competition.id,
            patrol_id: patrolId,
            station_id: stationId,
            score,
          })
          .select()
          .single();

        if (error) {
          console.error("Failed to insert score:", error);
          setScoreSaveState((prev) => new Map(prev).set(key, "error"));
          return;
        }

        const newScore = mapDbScore(data);

        setCompetitions((prev) =>
          prev.map((c) =>
            c.id === competition.id
              ? { ...c, scores: [...c.scores, newScore] }
              : c
          )
        );
      }

      setScoreSaveState((prev) => new Map(prev).set(key, "saved"));
      setTimeout(() => {
        setScoreSaveState((prev) => {
          const next = new Map(prev);
          if (next.get(key) === "saved") next.set(key, "idle");
          return next;
        });
      }, 1500);
    },
    [competition, scores]
  );

  const getScore = useCallback(
    (patrolId: string, stationId: string) => {
      const key = scoreKey(patrolId, stationId);
      const override = scoreOverrides.get(key);
      if (override !== undefined) return override;

      const existing = scores.find(
        (s) => s.patrolId === patrolId && s.stationId === stationId
      );
      return existing?.score ?? 0;
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

  const retrySaveScore = useCallback(
    async (patrolId: string, stationId: string) => {
      const key = scoreKey(patrolId, stationId);
      const pending = pendingRetry.get(key);
      if (!pending) return;

      setScoreOverrides((prev) => new Map(prev).set(key, pending.score));
      setScoreSaveState((prev) => new Map(prev).set(key, "saving"));

      await setScore(patrolId, stationId, pending.score);
    },
    [pendingRetry, setScore]
  );

  const getPatrolsWithScores = useCallback(
    (section?: ScoutSection): PatrolWithScore[] => {
      const relevantPatrols = section
        ? patrols.filter((p) => p.section === section)
        : patrols;

      return relevantPatrols.map((p) => {
        const patrolScores = scores.filter((s) => s.patrolId === p.id);
        const totalScore = patrolScores.reduce(
          (sum, s) => sum + (s.score ?? 0),
          0
        );

        return { patrol: p, totalScore };
      });
    },
    [patrols, scores]
  );

  const getStationScores = useCallback(
    (stationId: string) => {
      const stationScores = scores.filter((s) => s.stationId === stationId);

      return stationScores
        .map((s) => {
          const patrol = patrols.find((p) => p.id === s.patrolId);
          return patrol ? { patrol, score: s.score ?? 0 } : null;
        })
        .filter((item): item is { patrol: Patrol; score: number } => !!item);
    },
    [scores, patrols]
  );

  const getScoutGroupName = useCallback(
    (groupId: string) => {
      return scoutGroups.find((g) => g.id === groupId)?.name;
    },
    [scoutGroups]
  );

  const updateCompetition = useCallback(
    (updates: Partial<Competition>) => {
      if (!competition) return;

      setCompetitions((prev) =>
        prev.map((c) => (c.id === competition.id ? { ...c, ...updates } : c))
      );
    },
    [competition]
  );

  return (
    <CompetitionContext.Provider
      value={{
        competitions,
        activeCompetitions,
        archivedCompetitions,

        selectableCompetitions,
        scorerActiveCompetitions,
        allowedCompetitionIds,
        canSelectCompetition,

        competition,
        stations,
        patrols,
        scores,
        scoutGroups,

        scoutGroupTemplates,

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
        deleteScoutGroup,
        renameScoutGroup,
        movePatrolToGroup,

        addScoutGroupTemplate,
        applyScoutGroupTemplate,
        deleteScoutGroupTemplate,

        setScore,
        getScore,
        getScoreSaveState,
        retrySaveScore,

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
  const ctx = useContext(CompetitionContext);
  if (!ctx)
    throw new Error("useCompetition must be used within a CompetitionProvider");
  return ctx;
}
