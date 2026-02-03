import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  ScoutSection,
  Station,
} from "@/types/competition";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SCOUT_SECTIONS } from "@/types/competition";

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

  // används av poängsättning/UI
  isStationAllowedForSection: (station: Station, section: ScoutSection) => boolean;
  getStationsForSection: (section?: ScoutSection) => Station[];

  updateCompetition: (updates: Partial<Competition>) => void;
}

const CompetitionContext = createContext<CompetitionContextType | undefined>(undefined);

const SELECTED_KEY = "scout-selected-competition";
const AUTH_SELECTED_KEY = "selectedCompetitionId";

// --- helpers för allowed_sections ("alla" = full array) ---
const ALL_SECTION_KEYS = Object.keys(SCOUT_SECTIONS);

/**
 * Normaliserar allowedSections till en *array* med stabil ordning.
 * - null/undefined/ogiltigt => ALL_SECTION_KEYS
 * - array => filtrera till kända keys + stabil ordning
 */
function normalizeAllowedSectionsToArray(v: unknown): string[] {
  if (!Array.isArray(v) || v.length === 0) return [...ALL_SECTION_KEYS];
  const set = new Set(v.map(String));
  return ALL_SECTION_KEYS.filter((k) => set.has(k));
}

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
  const allowedSections = normalizeAllowedSectionsToArray(row.allowed_sections);
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    maxScore: row.max_score ?? row.maxScore ?? 0,
    leaderEmail: row.leader_email ?? undefined,
    allowedSections: allowedSections as any,
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
    return localStorage.getItem(AUTH_SELECTED_KEY) || localStorage.getItem(SELECTED_KEY) || null;
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
  } catch {
    // ignore
  }
}

function scoreKey(patrolId: string, stationId: string) {
  return `${patrolId}__${stationId}`;
}

type UserCompetitionRoleRow = { competition_id: string; role: string };

export function CompetitionProvider({ children }: { children: React.ReactNode }) {
  const { user, isGlobalAdmin } = useAuth();

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => readSelectedCompetitionId());

  const [adminCompetitionIds, setAdminCompetitionIds] = useState<string[]>([]);
  const [scorerCompetitionIds, setScorerCompetitionIds] = useState<string[]>([]);
  const [scoutGroupTemplates, setScoutGroupTemplates] = useState<ScoutGroupTemplate[]>([]);

  const [scoreOverrides, setScoreOverrides] = useState<Map<string, number>>(new Map());
  const [scoreSaveState, setScoreSaveState] = useState<Map<string, SaveState>>(new Map());
  const [pendingRetry, setPendingRetry] = useState<
    Map<string, { patrolId: string; stationId: string; score: number }>
  >(new Map());

  // ✅ För att inte “nollställa” vald tävling vid refresh innan data/roller är laddade
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [compsLoaded, setCompsLoaded] = useState(false);

  const refreshAllInFlightRef = useRef(false);
  const refreshAllLastKeyRef = useRef<string>("");

  const competition = useMemo(
    () => competitions.find((c) => c.id === selectedId) ?? null,
    [competitions, selectedId]
  );
  const activeCompetitions = useMemo(() => competitions.filter((c) => c.status === "active"), [competitions]);
  const archivedCompetitions = useMemo(() => competitions.filter((c) => c.status === "closed"), [competitions]);

  const isAnyCompetitionAdmin = adminCompetitionIds.length > 0;

  const allowedCompetitionIds = useMemo(() => {
    if (isGlobalAdmin) return competitions.map((c) => c.id);
    if (isAnyCompetitionAdmin) return adminCompetitionIds.map(String);
    return scorerCompetitionIds.map(String);
  }, [isGlobalAdmin, isAnyCompetitionAdmin, adminCompetitionIds, scorerCompetitionIds, competitions]);

  const selectableCompetitions = useMemo(() => {
    if (isGlobalAdmin) return activeCompetitions;

    if (isAnyCompetitionAdmin) {
      const allowed = new Set(adminCompetitionIds.map(String));
      return activeCompetitions.filter((c) => allowed.has(c.id));
    }

    const allowed = new Set(scorerCompetitionIds.map(String));
    return activeCompetitions.filter((c) => allowed.has(c.id));
  }, [isGlobalAdmin, isAnyCompetitionAdmin, adminCompetitionIds, scorerCompetitionIds, activeCompetitions]);

  const canSelectCompetition = useCallback(
    (competitionId: string) => {
      if (isGlobalAdmin) return true;

      if (isAnyCompetitionAdmin) {
        return adminCompetitionIds.map(String).includes(String(competitionId));
      }

      return (
        scorerCompetitionIds.map(String).includes(String(competitionId)) &&
        activeCompetitions.some((c) => c.id === competitionId)
      );
    },
    [isGlobalAdmin, isAnyCompetitionAdmin, adminCompetitionIds, scorerCompetitionIds, activeCompetitions]
  );

  const stations = competition?.stations ?? [];
  const patrols = competition?.patrols ?? [];
  const scores = competition?.scores ?? [];
  const scoutGroups = competition?.scoutGroups ?? [];

  // Persist vald tävling till localStorage
  useEffect(() => {
    // Undvik att skriva över localStorage under auth-hydrering (selectedId kan bli null temporärt)
    if (!selectedId && !isGlobalAdmin && !user?.id) return;
    writeSelectedCompetitionId(selectedId);
  }, [selectedId, isGlobalAdmin, user?.id]);

  // Synka om flera tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SELECTED_KEY || e.key === AUTH_SELECTED_KEY) {
        const v = readSelectedCompetitionId();
        setSelectedId(v);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const refreshCompetitionRoles = useCallback(async () => {
    if (!user?.id) {
      // Vänta tills auth har laddat klart (annars riskerar vi att nolla selectedId och skriva över localStorage)
      setAdminCompetitionIds([]);
      setScorerCompetitionIds([]);
      setRolesLoaded(false);
      return;
    }

    const { data, error } = await supabase
      .from("user_competition_roles")
      .select("competition_id,role")
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to load user_competition_roles:", error);
      setAdminCompetitionIds([]);
      setScorerCompetitionIds([]);
      setRolesLoaded(true);
      return;
    }

    const rows = (data ?? []) as UserCompetitionRoleRow[];
    setAdminCompetitionIds(rows.filter((r) => String(r.role) === "admin").map((r) => String(r.competition_id)));
    setScorerCompetitionIds(rows.filter((r) => String(r.role) === "scorer").map((r) => String(r.competition_id)));
    setRolesLoaded(true);
  }, [user?.id]);

  /**
   * ✅ Viktig fix för “vald tävling ligger kvar vid refresh”
   * Tidigare kunde den här effekten köra innan roller/competitions var laddade,
   * vilket gjorde att selectedId blev null/överskriven. Nu väntar vi tills både
   * roller och tävlingar är laddade.
   */
  useEffect(() => {
    if (!rolesLoaded || !compsLoaded) return;

    // Om användaren inte är inloggad ännu (auth hydrering), rör inte selectedId.
    if (!isGlobalAdmin && !user?.id) return;

    // Respektera alltid sparad vald tävling om den fortfarande är "tillåten"
    if (selectedId) {
      const selectedComp = competitions.find((c) => c.id === selectedId);
      const isAllowedForUser =
        !!selectedComp &&
        (isGlobalAdmin ||
          adminCompetitionIds.map(String).includes(String(selectedId)) ||
          (scorerCompetitionIds.map(String).includes(String(selectedId)) && selectedComp.status === "active"));

      if (isAllowedForUser) return;
    }

    // Annars: välj “första rimliga” baserat på roll
    if (isGlobalAdmin) {
      if (activeCompetitions.length > 0) setSelectedId(activeCompetitions[0].id);
      else if (archivedCompetitions.length > 0) setSelectedId(archivedCompetitions[0].id);
      else setSelectedId(null);
      return;
    }

    if (isAnyCompetitionAdmin) {
      const allowed = new Set(adminCompetitionIds.map(String));
      const allowedList = competitions.filter((c) => allowed.has(c.id));
      if (allowedList.length === 0) {
        setSelectedId(null);
        return;
      }
      const firstActive = allowedList.find((c) => c.status === "active");
      setSelectedId(firstActive?.id ?? allowedList[0].id);
      return;
    }

    if (selectableCompetitions.length === 0) {
      setSelectedId(null);
      return;
    }

    setSelectedId(selectableCompetitions[0].id);
  }, [
    rolesLoaded,
    compsLoaded,
    isGlobalAdmin,
    user?.id,
    competitions,
    activeCompetitions,
    archivedCompetitions,
    isAnyCompetitionAdmin,
    adminCompetitionIds,
    scorerCompetitionIds,
    selectableCompetitions,
    selectedId,
  ]);


  const refreshAll = useCallback(async () => {
    if (refreshAllInFlightRef.current) return;
    refreshAllInFlightRef.current = true;

    const key = `${user?.id ?? "anon"}-${isGlobalAdmin}-${adminCompetitionIds.join(",")}-${scorerCompetitionIds.join(",")}`;
    refreshAllLastKeyRef.current = key;

    try {
      const { data: comps, error: compsErr } = await supabase
        .from("competitions")
        .select("id,name,date,is_active,created_at,closed_at")
        .order("created_at", { ascending: false });

      if (compsErr) {
        console.error("Failed to load competitions:", compsErr);
        setCompetitions([]);
        setCompsLoaded(true);
        return;
      }

      const mapped = (comps ?? []).map(mapDbCompetition);

      // Bestäm vilka competitions vi ska hämta “child data” för
      let idsToFetch: string[] = [];
      if (isGlobalAdmin) {
        idsToFetch = mapped.map((c) => c.id);
      } else if (adminCompetitionIds.length > 0) {
        const allowed = new Set(adminCompetitionIds.map(String));
        idsToFetch = mapped.filter((c) => allowed.has(c.id)).map((c) => c.id);
      } else {
        const allowed = new Set(scorerCompetitionIds.map(String));
        idsToFetch = mapped.filter((c) => c.status === "active" && allowed.has(c.id)).map((c) => c.id);
      }

      setCompetitions(mapped);
      setCompsLoaded(true);

      if (idsToFetch.length === 0) return;

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

      if (refreshAllLastKeyRef.current === key) {
        setCompetitions(merged);
      }
    } finally {
      refreshAllInFlightRef.current = false;
    }
  }, [user?.id, isGlobalAdmin, adminCompetitionIds, scorerCompetitionIds]);

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
  }, []);

  useEffect(() => {
    setRolesLoaded(false);
    refreshCompetitionRoles();
  }, [refreshCompetitionRoles]);

  useEffect(() => {
    setCompsLoaded(false);
    refreshAll();
    refreshTemplates();
  }, [refreshAll, refreshTemplates]);

  // -------------------------
  // section-filter helpers
  // -------------------------
  const isStationAllowedForSection = useCallback((station: Station, section: ScoutSection) => {
    const allowed = normalizeAllowedSectionsToArray((station as any).allowedSections);
    return allowed.includes(String(section));
  }, []);

  const getStationsForSection = useCallback(
    (section?: ScoutSection) => {
      if (!section) return stations;
      return stations.filter((s) => isStationAllowedForSection(s, section));
    },
    [stations, isStationAllowedForSection]
  );

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

      const newComp = mapDbCompetition(dbComp);
      setCompetitions((prev) => [newComp, ...prev]);
      setSelectedId(newComp.id);

      refreshCompetitionRoles();
      return newComp;
    },
    [refreshCompetitionRoles]
  );

  const selectCompetition = useCallback(
    (id: string) => {
      if (canSelectCompetition(id)) {
        setSelectedId(id);
      }
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

      setCompetitions((prev) => prev.map((c) => (c.id === id ? { ...c, status: "closed", closedAt } : c)));

      if (id === selectedId) {
        const nextSelectable = selectableCompetitions.filter((c) => c.id !== id);
        setSelectedId(nextSelectable[0]?.id ?? null);
      }
    },
    [selectedId, selectableCompetitions]
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

      const allowed_sections = normalizeAllowedSectionsToArray((station as any).allowedSections);

      const { data, error } = await supabase
        .from("stations")
        .insert({
          competition_id: selectedId,
          name: station.name,
          description: station.description,
          max_score: station.maxScore,
          leader_email: station.leaderEmail ?? null,
          allowed_sections,
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

      // om allowedSections finns med i updates (även om null) så uppdatera DB
      if ("allowedSections" in (updates as any)) {
        patch.allowed_sections = normalizeAllowedSectionsToArray((updates as any).allowedSections);
      }

      const { error } = await supabase.from("stations").update(patch).eq("id", id);

      if (error) {
        console.error("Failed to update station:", error);
        return;
      }

      const nextUpdates: Partial<Station> = { ...updates };
      if ("allowedSections" in (updates as any)) {
        (nextUpdates as any).allowedSections = normalizeAllowedSectionsToArray((updates as any).allowedSections);
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? { ...c, stations: c.stations.map((s) => (s.id === id ? { ...s, ...nextUpdates } : s)) }
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
          scout_group_id: (patrol as any).scoutGroupId ?? null,
          members: (patrol as any).members ?? null,
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
      if ("scoutGroupId" in updates) patch.scout_group_id = (updates as any).scoutGroupId ?? null;
      if ("members" in updates) patch.members = (updates as any).members ?? null;

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
                patrols: c.patrols.map((p) => ((p as any).scoutGroupId === id ? { ...p, scoutGroupId: undefined } : p)),
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
        prev.map((c) => (c.id === selectedId ? { ...c, scoutGroups: [...c.scoutGroups, ...newGroups] } : c))
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

      // Optimistic UI
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

        isStationAllowedForSection,
        getStationsForSection,

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
