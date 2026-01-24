import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
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

type ScoreSaveState = "idle" | "saving" | "saved" | "error";

interface CompetitionContextType {
  competitions: Competition[];
  activeCompetitions: Competition[];
  archivedCompetitions: Competition[];

  competition: Competition | null;
  stations: Station[];
  patrols: Patrol[];
  scores: Score[];
  scoutGroups: ScoutGroup[];

  createCompetition: (data: { name: string; date: string }) => Promise<Competition>;
  selectCompetition: (id: string) => void;
  closeCompetition: (id: string) => void;
  reopenCompetition: (id: string) => void;
  deleteCompetition: (id: string) => void;
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

  scoutGroupTemplates: ScoutGroupTemplate[];
  createScoutGroupTemplate: (name: string, groups: string[]) => Promise<void>;
  deleteScoutGroupTemplate: (id: string) => Promise<void>;
  saveCurrentGroupsAsTemplate: (templateName: string) => Promise<void>;

  // ✅ Scores (DB)
  setScore: (patrolId: string, stationId: string, score: number) => Promise<void>;
  getScore: (patrolId: string, stationId: string) => number;
  getScoreSaveState: (patrolId: string, stationId: string) => ScoreSaveState;
  retrySaveScore: (patrolId: string, stationId: string) => Promise<void>;

  getPatrolsWithScores: (section?: ScoutSection) => PatrolWithScore[];
  getStationScores: (stationId: string) => Array<{ patrol: Patrol; score: number }>;
  getScoutGroupName: (groupId: string) => string | undefined;

  updateCompetition: (updates: Partial<Competition>) => void;
}

const CompetitionContext = createContext<CompetitionContextType | undefined>(undefined);

const scoreKey = (competitionId: string, patrolId: string, stationId: string) =>
  `${competitionId}::${patrolId}::${stationId}`;

export function CompetitionProvider({ children }: { children: React.ReactNode }) {
  // ------------------------------------------------------------
  // OBS: Jag lämnar dina befintliga DB-loads för competitions/templates/stations/patrols som de är.
  // Här visar jag bara den delen som behövs för scores + state.
  // ------------------------------------------------------------

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Derived state
  const competition = useMemo(() => competitions.find((c) => c.id === selectedId) ?? null, [competitions, selectedId]);
  const activeCompetitions = useMemo(() => competitions.filter((c) => c.status === "active"), [competitions]);
  const archivedCompetitions = useMemo(() => competitions.filter((c) => c.status === "closed"), [competitions]);

  const stations = competition?.stations ?? [];
  const patrols = competition?.patrols ?? [];
  const scores = competition?.scores ?? [];
  const scoutGroups = competition?.scoutGroups ?? [];
  const scoutGroupTemplates = competition?.scoutGroupTemplates ?? ([] as any); // om du har dem i context, annars byt till ditt riktiga state

  // ----------------------------------------------------------------
  // ✅ Score save state + last attempted value (för retry)
  // ----------------------------------------------------------------
  const [scoreSaveStates, setScoreSaveStates] = useState<Record<string, ScoreSaveState>>({});
  const [scoreLastAttempt, setScoreLastAttempt] = useState<Record<string, number>>({});

  const getScoreSaveState = useCallback(
    (patrolId: string, stationId: string): ScoreSaveState => {
      if (!selectedId) return "idle";
      const k = scoreKey(selectedId, patrolId, stationId);
      return scoreSaveStates[k] ?? "idle";
    },
    [scoreSaveStates, selectedId]
  );

  // ✅ Get local cached score value (from state)
  const getScore = useCallback(
    (patrolId: string, stationId: string) => {
      const scoreRecord = scores.find((s) => s.patrolId === patrolId && s.stationId === stationId);
      return scoreRecord?.score ?? 0;
    },
    [scores]
  );

  // ✅ Upsert score till DB + uppdatera lokal state
  const setScore = useCallback(
    async (patrolId: string, stationId: string, scoreValue: number) => {
      if (!selectedId) return;

      const k = scoreKey(selectedId, patrolId, stationId);

      // Optimistisk UI: uppdatera lokalt direkt
      setCompetitions((prev) =>
        prev.map((c) => {
          if (c.id !== selectedId) return c;

          const existingIndex = (c.scores ?? []).findIndex(
            (s) => s.patrolId === patrolId && s.stationId === stationId
          );

          const newScore: Score = {
            id: existingIndex >= 0 ? c.scores[existingIndex].id : crypto.randomUUID(),
            patrolId,
            stationId,
            score: scoreValue,
            updatedAt: new Date().toISOString(),
          };

          if (existingIndex >= 0) {
            const nextScores = [...c.scores];
            nextScores[existingIndex] = newScore;
            return { ...c, scores: nextScores };
          }

          return { ...c, scores: [...(c.scores ?? []), newScore] };
        })
      );

      setScoreLastAttempt((prev) => ({ ...prev, [k]: scoreValue }));
      setScoreSaveStates((prev) => ({ ...prev, [k]: "saving" }));

      // 🔥 DB upsert: använd snake_case som din tabell har
      const payload = {
        competition_id: selectedId,
        patrol_id: patrolId,
        station_id: stationId,
        score: scoreValue,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("scores")
        .upsert(payload, { onConflict: "competition_id,patrol_id,station_id" });

      if (error) {
        // Detta är din 400: logga detaljer så du ser exakt varför
        console.error("Failed to save score:", {
          message: error.message,
          details: (error as any).details,
          hint: (error as any).hint,
          code: (error as any).code,
          payload,
        });

        setScoreSaveStates((prev) => ({ ...prev, [k]: "error" }));
        return;
      }

      // Markera “saved” en stund
      setScoreSaveStates((prev) => ({ ...prev, [k]: "saved" }));
      window.setTimeout(() => {
        setScoreSaveStates((prev) => {
          // sänk bara om den fortfarande är saved (om user ändrade igen -> saving/error)
          if (prev[k] !== "saved") return prev;
          const copy = { ...prev };
          copy[k] = "idle";
          return copy;
        });
      }, 1200);
    },
    [selectedId]
  );

  // ✅ Retry: försök spara senaste värdet igen
  const retrySaveScore = useCallback(
    async (patrolId: string, stationId: string) => {
      if (!selectedId) return;
      const k = scoreKey(selectedId, patrolId, stationId);

      const last = scoreLastAttempt[k];
      // fallback: ta nuvarande value om last saknas
      const current = getScore(patrolId, stationId);
      const valueToRetry = typeof last === "number" ? last : current;

      await setScore(patrolId, stationId, valueToRetry);
    },
    [selectedId, scoreLastAttempt, getScore, setScore]
  );

  // ------------------------------------------------------------
  // Resten av dina metoder: lämna som du har (DB för competitions/templates/stations/patrols osv)
  // ------------------------------------------------------------

  const createCompetition = useCallback(async (data: { name: string; date: string }): Promise<Competition> => {
    // behåll din befintliga DB-implementation
    throw new Error("Not implemented here (keep your current DB implementation).");
  }, []);

  const selectCompetition = useCallback((id: string) => setSelectedId(id), []);

  const closeCompetition = useCallback((_id: string) => {}, []);
  const reopenCompetition = useCallback((_id: string) => {}, []);
  const deleteCompetition = useCallback((_id: string) => {}, []);
  const updateCompetitionById = useCallback((_id: string, _updates: Partial<Competition>) => {}, []);

  const addStation = useCallback(async (_station: Omit<Station, "id" | "createdAt">) => {}, []);
  const updateStation = useCallback(async (_id: string, _updates: Partial<Station>) => {}, []);
  const deleteStation = useCallback(async (_id: string) => {}, []);

  const addPatrol = useCallback(async (_patrol: Omit<Patrol, "id" | "createdAt">) => {}, []);
  const updatePatrol = useCallback(async (_id: string, _updates: Partial<Patrol>) => {}, []);
  const deletePatrol = useCallback(async (_id: string) => {}, []);

  const addScoutGroup = useCallback(async (_name: string) => {}, []);
  const updateScoutGroup = useCallback(async (_id: string, _name: string) => {}, []);
  const deleteScoutGroup = useCallback(async (_id: string) => {}, []);
  const importScoutGroupsFromTemplate = useCallback(async (_templateId: string) => {}, []);

  const createScoutGroupTemplate = useCallback(async (_name: string, _groups: string[]) => {}, []);
  const deleteScoutGroupTemplate = useCallback(async (_id: string) => {}, []);
  const saveCurrentGroupsAsTemplate = useCallback(async (_templateName: string) => {}, []);

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

  const getScoutGroupName = useCallback(
    (groupId: string) => scoutGroups.find((g) => g.id === groupId)?.name,
    [scoutGroups]
  );

  const updateCompetition = useCallback((_updates: Partial<Competition>) => {}, []);

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
        scoutGroupTemplates: (Array.isArray(scoutGroupTemplates) ? scoutGroupTemplates : []) as any,
        createScoutGroupTemplate,
        deleteScoutGroupTemplate,
        saveCurrentGroupsAsTemplate,
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
  const context = useContext(CompetitionContext);
  if (!context) throw new Error("useCompetition must be used within a CompetitionProvider");
  return context;
}
