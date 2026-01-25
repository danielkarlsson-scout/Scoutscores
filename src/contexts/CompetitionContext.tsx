import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Competition, ScoutSection } from '@/types/competition';

type CompetitionContextType = {
  loading: boolean;

  competition: Competition | null;

  activeCompetitions: Competition[];
  archivedCompetitions: Competition[];

  // For UI (scorer): only competitions the user can score in AND that are open
  selectableActiveCompetitions: Competition[];

  selectedCompetitionId: string | null;
  selectCompetition: (competitionId: string) => void;

  // Existing things your app already uses (stations, patrols etc.)
  stations: any[];
  patrols: any[];
  scoutGroups: any[];
  groupTemplates: any[];

  refreshAll: () => Promise<void>;
};

const CompetitionContext = createContext<CompetitionContextType | undefined>(undefined);

const SELECTED_KEY = 'scoutscores_selected_competition_id';

export function CompetitionProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const { isAdmin, isScorer, scorerPermissions } = useAuth();

  const [loading, setLoading] = useState(true);

  const [activeCompetitions, setActiveCompetitions] = useState<Competition[]>([]);
  const [archivedCompetitions, setArchivedCompetitions] = useState<Competition[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const fromStorage = typeof window !== 'undefined' ? localStorage.getItem(SELECTED_KEY) : null;
    return fromStorage || null;
  });

  const [stations, setStations] = useState<any[]>([]);
  const [patrols, setPatrols] = useState<any[]>([]);
  const [scoutGroups, setScoutGroups] = useState<any[]>([]);
  const [groupTemplates, setGroupTemplates] = useState<any[]>([]);

  const allowedCompetitionIdsForScorer = useMemo(() => {
    const s = new Set<string>();
    for (const p of scorerPermissions) s.add(p.competitionId);
    return s;
  }, [scorerPermissions]);

  const selectableActiveCompetitions = useMemo(() => {
    if (isAdmin) return activeCompetitions;
    if (!isScorer) return []; // non-scorer should not select competitions here (they can still apply)
    return activeCompetitions.filter((c) => allowedCompetitionIdsForScorer.has(c.id));
  }, [isAdmin, isScorer, activeCompetitions, allowedCompetitionIdsForScorer]);

  // Determine "current competition" (selected) from selectedId
  const competition = useMemo(() => {
    if (!selectedId) return null;

    // Admin: can select any
    if (isAdmin) {
      return (
        activeCompetitions.find((c) => c.id === selectedId) ??
        archivedCompetitions.find((c) => c.id === selectedId) ??
        null
      );
    }

    // Scorer: only selectable actives
    if (isScorer) {
      return selectableActiveCompetitions.find((c) => c.id === selectedId) ?? null;
    }

    return null;
  }, [selectedId, isAdmin, isScorer, activeCompetitions, archivedCompetitions, selectableActiveCompetitions]);

  const fetchCompetitions = async () => {
    const { data, error } = await (supabase as any)
      .from('competitions')
      .select('*')
      .order('date', { ascending: true });

    if (error) throw error;

    const comps: Competition[] = (data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      date: c.date,
      isActive: !!c.is_active,
      createdAt: c.created_at,
      closedAt: c.closed_at,
    }));

    setActiveCompetitions(comps.filter((c) => c.isActive));
    setArchivedCompetitions(comps.filter((c) => !c.isActive));
  };

  const fetchStations = async (competitionId: string) => {
    const { data, error } = await (supabase as any)
      .from('stations')
      .select('*')
      .eq('competition_id', competitionId)
      .order('order_index', { ascending: true });

    if (error) throw error;
    setStations(data ?? []);
  };

  const fetchPatrols = async (competitionId: string) => {
    const { data, error } = await (supabase as any)
      .from('patrols')
      .select('*')
      .eq('competition_id', competitionId)
      .order('name', { ascending: true });

    if (error) throw error;
    setPatrols(data ?? []);
  };

  const fetchScoutGroups = async (competitionId: string) => {
    const { data, error } = await (supabase as any)
      .from('scout_groups')
      .select('*')
      .eq('competition_id', competitionId)
      .order('name', { ascending: true });

    if (error) throw error;
    setScoutGroups(data ?? []);
  };

  const fetchGroupTemplates = async () => {
    const { data, error } = await (supabase as any).from('scout_group_templates').select('*');

    if (error) throw error;
    setGroupTemplates(data ?? []);
  };

  const refreshAll = async () => {
    setLoading(true);
    try {
      await fetchCompetitions();
      await fetchGroupTemplates();
    } catch (e) {
      console.error('Failed to fetch competitions:', e);
      toast({
        title: 'Kunde inte hämta tävlingar',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep selectedId valid depending on role/permissions/active comps
  useEffect(() => {
    // Admin: keep stored selection if it exists, else pick first active, else first archived, else null
    if (isAdmin) {
      const exists =
        (selectedId && activeCompetitions.some((c) => c.id === selectedId)) ||
        (selectedId && archivedCompetitions.some((c) => c.id === selectedId));

      if (exists) return;

      const fallback = activeCompetitions[0]?.id ?? archivedCompetitions[0]?.id ?? null;
      setSelectedId(fallback);
      if (fallback) localStorage.setItem(SELECTED_KEY, fallback);
      else localStorage.removeItem(SELECTED_KEY);
      return;
    }

    // Scorer: must be one of selectable active competitions
    if (isScorer) {
      const selectableIds = selectableActiveCompetitions.map((c) => c.id);

      // If user has no open competitions, selected must be null
      if (selectableIds.length === 0) {
        if (selectedId !== null) {
          setSelectedId(null);
          localStorage.removeItem(SELECTED_KEY);
        }
        return;
      }

      // If current selection is valid, keep it
      if (selectedId && selectableIds.includes(selectedId)) return;

      // Otherwise default to first selectable
      const next = selectableIds[0];
      setSelectedId(next);
      localStorage.setItem(SELECTED_KEY, next);
      return;
    }

    // Non-scorer/non-admin: no selection needed
    if (selectedId !== null) {
      setSelectedId(null);
      localStorage.removeItem(SELECTED_KEY);
    }
  }, [isAdmin, isScorer, selectableActiveCompetitions, activeCompetitions, archivedCompetitions, selectedId]);

  // When competition changes, fetch competition-scoped resources
  useEffect(() => {
    const cid = competition?.id;
    if (!cid) {
      setStations([]);
      setPatrols([]);
      setScoutGroups([]);
      return;
    }

    (async () => {
      try {
        await Promise.all([fetchStations(cid), fetchPatrols(cid), fetchScoutGroups(cid)]);
      } catch (e) {
        console.error('Failed to fetch competition data:', e);
      }
    })();
  }, [competition?.id]);

  const selectCompetition = (competitionId: string) => {
    if (isAdmin) {
      setSelectedId(competitionId);
      localStorage.setItem(SELECTED_KEY, competitionId);
      return;
    }

    if (isScorer) {
      const allowed = selectableActiveCompetitions.some((c) => c.id === competitionId);
      if (!allowed) return;

      setSelectedId(competitionId);
      localStorage.setItem(SELECTED_KEY, competitionId);
      return;
    }
  };

  const value: CompetitionContextType = {
    loading,

    competition,
    activeCompetitions,
    archivedCompetitions,

    selectableActiveCompetitions,
    selectedCompetitionId: selectedId,

    selectCompetition,

    stations,
    patrols,
    scoutGroups,
    groupTemplates,

    refreshAll,
  };

  return <CompetitionContext.Provider value={value}>{children}</CompetitionContext.Provider>;
}

export function useCompetition() {
  const ctx = useContext(CompetitionContext);
  if (!ctx) throw new Error('useCompetition must be used within CompetitionProvider');
  return ctx;
}
