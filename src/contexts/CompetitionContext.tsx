import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
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

  selectableCompetitions: Competition[];
  allowedCompetitionIds: string[];
  canSelectCompetition: (competitionId: string) => boolean;

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
const AUTH_SELECTED_KEY = "selectedCompetitionId";

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

function readSelectedCompetitionId(): string | null {
  try {
    return (
      localStorage.getItem(AUTH_SELECTED_KEY) ||
      localStorage.getItem(SELECTED_KEY) ||
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

    // NOTE: "storage" triggas inte i samma tab som gör setItem()
    window.dispatchEvent(new Event("selectedCompetitionIdChanged"));
  } catch {
    // ignore
  }
}

export function CompetitionProvider({ children }: { children: React.ReactNode }) {
  const { user, isGlobalAdmin } = useAuth();

  const [adminCompetitionIds, setAdminCompetitionIds] = useState<string[]>([]);
  // scorerCompetitionIds state declared above
  const isAnyCompetitionAdmin = adminCompetitionIds.length > 0;

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => readSelectedCompetitionId());
  const [scoutGroupTemplates, setScoutGroupTemplates] = useState<ScoutGroupTemplate[]>([]);

  const [scoreOverrides, setScoreOverrides] = useState<Map<string, number>>(new Map());
  const [scoreSaveState, setScoreSaveState] = useState<Map<string, SaveState>>(new Map());
  const [pendingRetry, setPendingRetry] = useState<
  const refreshAllInFlightRef = useRef(false);
  const refreshAllLastKeyRef = useRef<string>("");
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

  // RLS ska redan begränsa vilka competitions du ser.
  // Global admin: ser alla. Admin/scorer: ser de de har access till.
  const allowedCompetitionIds = useMemo(
    () => competitions.map((c) => c.id),
    [competitions]
  );

  // UI: låt användaren välja bland aktiva som de ser via RLS
  const selectableCompetitions = useMemo(() => activeCompetitions, [activeCompetitions]);

  const canSelectCompetition = useCallback(
    (competitionId: string) => {
      // får bara välja sådant vi faktiskt ser
      return selectableCompetitions.some((c) => c.id === competitionId);
    },
    [selectableCompetitions]
  );

  const stations = competition?.stations ?? [];
  const patrols = competition?.patrols ?? [];
  const scores = competition?.scores ?? [];
  const scoutGroups = competition?.scoutGroups ?? [];

  // persist selection (sync to both keys)
  useEffect(() => {
    writeSelectedCompetitionId(selectedId);
  }, [selectedId]);

  // keep in sync if something else updates localStorage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SELECTED_KEY || e.key === AUTH_SELECTED_KEY) {
        const v = readSelectedCompetitionId();
        setSelectedId(v);
      }
    };

    const onCustom = () => {
      const v = readSelectedCompetitionId();
      setSelectedId(v);
    };

    window.addEventListener("selectedCompetitionIdChanged", onCustom as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("selectedCompetitionIdChanged", onCustom as EventListener);
    };
  }, [refreshAll, refreshTemplates]);

  // admin-anywhere via RPC (ingen select mot competition_admins)
  // (removed) is_any_competition_admin rpc - using user_competition_roles instead

  // Auto-select / validate selection
  useEffect(() => {
    // Om vi inte har något val ännu: välj första aktiva vi kan se
    if (!selectedId) {
      if (selectableCompetitions.length > 0) setSelectedId(selectableCompetitions[0].id);
      else setSelectedId(null);
      return;
    }

    // Om selection inte längre finns i listan vi ser: välj om
    if (!competitions.some((c) => c.id === selectedId)) {
      if (selectableCompetitions.length > 0) setSelectedId(selectableCompetitions[0].id);
      else setSelectedId(null);
    }
  }, [selectedId, competitions, selectableCompetitions]);

  const refreshAll = useCallback(async () => {
    const key = `${user?.id ?? ""}:${isGlobalAdmin ? "global" : "scoped"}`;
    if (refreshAllInFlightRef.current) return;
    if (refreshAllLastKeyRef.current === key) return;
    refreshAllInFlightRef.current = true;
    refreshAllLastKeyRef.current = key;

    // 0) ladda tävlingsroller (admin/scorer) från user_competition_roles (RLS-safe för egna rader)
    let adminIds: string[] = [];
    let scorerIds: string[] = [];
    if (user?.id && !isGlobalAdmin) {
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_competition_roles")
        .select("competition_id, role")
        .eq("user_id", user.id);

      if (roleErr) {
        console.error("Failed to load user_competition_roles:", roleErr);
      } else {
        adminIds = (roleRows ?? []).filter((r: any) => String(r.role) === "admin").map((r: any) => String(r.competition_id));
        scorerIds = (roleRows ?? []).filter((r: any) => String(r.role) === "scorer").map((r: any) => String(r.competition_id));
      }
    }
    setAdminCompetitionIds(adminIds);
    setScorerCompetitionIds(scorerIds);

    try {
    // 1) competitions (RLS ska redan begränsa)
    const { data: comps, error: compsErr } = await supabase
      .from("competitions")
      .select("id,name,date,is_active,created_at,closed_at")
      .order("created_at", { ascending: false });

    if (compsErr) {
      console.error("Failed to load competitions:", compsErr);
      setCompetitions([]);
      return;
    }

    const mapped = (comps ?? []).map(mapDbCompetition);

    // För scorers: vi laddar bara relaterad data för aktiva tävlingar
    // För admin/global admin: vi kan ladda för allt vi ser
    const idsToFetch =
      isGlobalAdmin || isAnyCompetitionAdmin
        ? mapped.map((c) => c.id)
        : mapped.filter((c) => c.status === "active").map((c) => c.id);

    // Always set base competitions list (så UI inte dör)
    if (idsToFetch.length === 0) {
      setCompetitions(mapped);
      return;
    }

    const [stationsRes, patrolsRes, scoresRes, groupsRes] = await Promise.all([
      supabase
        .from("stations")
        .select("id,competition_id,name,description,max_score,leader_email,allowed_sections,created_at")
        .in("competition_id", idsToFetch),
      supabase
        .from("patrols")
        .select("id,competition_id,name,section,scout_group_id,members,created_at")
        .in("competition_id", idsToFetch),
      supabase
        .from("scores")
        .select("id,competition_id,patrol_id,station_id,score,updated_at")
        .in("competition_id", idsToFetch),
      supabase
        .from("scout_groups")
        .select("id,competition_id,name,created_at")
        .in("competition_id", idsToFetch),
    ]);

    if (stationsRes.error) console.error("Failed to load stations:", stationsRes.error);
    if (patrolsRes.error) console.error("Failed to load patrols:", patrolsRes.error);
    if (scoresRes.error) console.error("Failed to load scores:", scoresRes.error);
    if (groupsRes.error) console.error("Failed to load scout_groups:", groupsRes.error);

    const stationsByComp = new Map<string, Station[]>();
    for (const row of stationsRes.data ?? []) {
      const cid = (row as any).competition_id;
      const arr = stationsByComp.get(cid) ?? [];
      arr.push(mapDbStation(row));
      stationsByComp.set(cid, arr);
    }

    const patrolsByComp = new Map<string, Patrol[]>();
    for (const row of patrolsRes.data ?? []) {
      const cid = (row as any).competition_id;
      const arr = patrolsByComp.get(cid) ?? [];
      arr.push(mapDbPatrol(row));
      patrolsByComp.set(cid, arr);
    }

    const scoresByComp = new Map<string, Score[]>();
    for (const row of scoresRes.data ?? []) {
      const cid = (row as any).competition_id;
      const arr = scoresByComp.get(cid) ?? [];
      arr.push(mapDbScore(row));
      scoresByComp.set(cid, arr);
    }

    const groupsByComp = new Map<string, ScoutGroup[]>();
    for (const row of groupsRes.data ?? []) {
      const cid = (row as any).competition_id;
      const arr = groupsByComp.get(cid) ?? [];
      arr.push(mapDbScoutGroup(row));
      groupsByComp.set(cid, arr);
    }

    const merged = mapped.map((c) => ({
      ...c,
      stations: stationsByComp.get(c.id) ?? [],
      patrols: patrolsByComp.get(c.id) ?? [],
      scores: scoresByComp.get(c.id) ?? [],
      scoutGroups: groupsByComp.get(c.id) ?? [],
    }));

    setCompetitions(merged);
    } finally {
      refreshAllInFlightRef.current = false;
    }
  }, [isGlobalAdmin, isAnyCompetitionAdmin]);

  const refreshTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from("scout_group_templates")
      .select("id,name,groups,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load templates:", error);
      setScoutGroupTemplates([]);
      return;
    }

    setScoutGroupTemplates((data ?? []).map(mapDbTemplate));
  }, [refreshAll, refreshTemplates]);

  useEffect(() => {
  let cancelled = false;

  const run = async () => {
    try {
      await refreshAll();
      await refreshTemplates();
    } catch (e) {
      console.error("Initial data load failed", e);
    }
  };

  run();

  return () => {
    cancelled = true;
  };
}, []); // 👈 VIKTIGT: tom dependency-array
  // -------------------------
  // competitions
  // -------------------------
  const createCompetition = useCallback(
    async (data: { name: string; date: string }): Promise<Competition> => {
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

      // Viktigt: INGEN klient-insert i competition_admins här.
      // Din DB-trigger (add_creator_as_competition_admin) ska hantera detta.

      const newComp = mapDbCompetition(dbComp);
      setCompetitions((prev) => [newComp, ...prev]);
      setSelectedId(newComp.id);

      return newComp;
    },
    []
  );

  const selectCompetition = useCallback(
    (id: string) => {
      if (canSelectCompetition(id)) setSelectedId(id);
    },
    [canSelectCompetition]
  );

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
        const nextSelectable = selectableCompetitions.filter((c) => c.id !== id);
        setSelectedId(nextSelectable[0]?.id ?? null);
      }
    },
    [selectedId, selectableCompetitions]
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
  }, [refreshAll, refreshTemplates]);

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
  }, [refreshAll, refreshTemplates]);

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
        prev.map((c) =>
          c.id === selectedId ? { ...c, stations: [...c.stations, newStation] } : c
        )
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
        prev.map((c) =>
          c.id === selectedId ? { ...c, scoutGroups: [...c.scoutGroups, newGroup] } : c
        )
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
  }, [refreshAll, refreshTemplates]);

  const importScoutGroupsFromTemplate = useCallback(
    async (templateId: string) => {
      if (!selectedId) return;

      const template = scoutGroupTemplates.find((t) => t.id === templateId);
      if (!template) return;

      const existingNames = new Set((scoutGroups ?? []).map((g) => g.name.toLowerCase()));
      const namesToAdd = template.groups.filter((n) => !existingNames.has(n.toLowerCase()));
      if (namesToAdd.length === 0) return;

      const rowsToInsert = namesToAdd.map((name) => ({ name, competition_id: selectedId }));

      const { data, error } = await supabase
        .from("scout_groups")
        .insert(rowsToInsert)
        .select("id,competition_id,name,created_at");

      if (error) {
        console.error("Kunde inte importera kårer från mall:", error);
        return;
      }

      const newGroups = (data ?? []).map(mapDbScoutGroup);

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === selectedId ? { ...c, scoutGroups: [...c.scoutGroups, ...newGroups] } : c
        )
      );
    },
    [selectedId, scoutGroupTemplates, scoutGroups]
  );

  // -------------------------
  // scoring
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

      setScoreSaveState((prev) => new Map(prev).set(key, "saving"));

      const { error } = await supabase
        .from("scores")
        .upsert(
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
      return patrols
        .map((patrol) => ({ patrol, score: getScore(patrol.id, stationId) }))
        .sort((a, b) => b.score - a.score);
    },
    [patrols, getScore]
  );

  const getScoutGroupName = useCallback(
    (groupId: string) => scoutGroups.find((g) => g.id === groupId)?.name,
    [scoutGroups]
  );

  return (
    <CompetitionContext.Provider
      value={{
        competitions,
        activeCompetitions,
        archivedCompetitions,

        selectableCompetitions,
        allowedCompetitionIds,
        canSelectCompetition,

        competition,
        stations,
        patrols,
        scores,
        scoutGroups,

        scoutGroupTemplates,

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

        saveCurrentGroupsAsTemplate,
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
  if (!ctx) throw new Error("useCompetition must be used within a CompetitionProvider");
  return ctx;
}
