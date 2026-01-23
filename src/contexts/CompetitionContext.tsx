import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Competition = {
  id: string;
  name: string;
  date: string | null;
  is_active: boolean;
  registration_open?: boolean;
  created_at?: string;
  updated_at?: string;
};

type CompetitionContextType = {
  competitions: Competition[];
  activeCompetitions: Competition[];
  archivedCompetitions: Competition[];

  loading: boolean;

  // selected competition (for UI convenience)
  selected: Competition | null;
  setSelected: (c: Competition | null) => void;

  // CRUD (DB)
  refresh: () => Promise<void>;
  createCompetition: (data: {
    name: string;
    date: string;
    is_active?: boolean;
    registration_open?: boolean;
  }) => Promise<Competition>;
  updateCompetition: (id: string, patch: Partial<Competition>) => Promise<Competition>;
  deleteCompetition: (id: string) => Promise<void>;
};

const CompetitionContext = createContext<CompetitionContextType | undefined>(undefined);

const SELECTED_KEY = "scout-selected-competition-db";

export function CompetitionProvider({ children }: { children: React.ReactNode }) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return localStorage.getItem(SELECTED_KEY);
  });

  const selected = useMemo(
    () => competitions.find((c) => c.id === selectedId) ?? null,
    [competitions, selectedId]
  );

  const activeCompetitions = useMemo(
    () => competitions.filter((c) => c.is_active),
    [competitions]
  );
  const archivedCompetitions = useMemo(
    () => competitions.filter((c) => !c.is_active),
    [competitions]
  );

  // persist selection
  useEffect(() => {
    if (selectedId) localStorage.setItem(SELECTED_KEY, selectedId);
    else localStorage.removeItem(SELECTED_KEY);
  }, [selectedId]);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("competitions")
      .select("id,name,date,is_active,registration_open,created_at,updated_at")
      .order("date", { ascending: true });

    if (error) {
      console.error("Failed to fetch competitions:", error);
      setCompetitions([]);
      setLoading(false);
      return;
    }

    setCompetitions((data ?? []) as Competition[]);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-select first active if none selected
  useEffect(() => {
    if (!selectedId && activeCompetitions.length > 0) {
      setSelectedId(activeCompetitions[0].id);
    }
  }, [selectedId, activeCompetitions]);

  const setSelected = (c: Competition | null) => {
    setSelectedId(c?.id ?? null);
  };

  const createCompetition: CompetitionContextType["createCompetition"] = async (data) => {
    const payload = {
      name: data.name.trim(),
      date: data.date || null,
      // ✅ Viktigt: defaulta till aktiv när man skapar från UI
      is_active: data.is_active ?? true,
      registration_open: data.registration_open ?? false,
    };

    const { data: row, error } = await supabase
      .from("competitions")
      .insert(payload)
      .select("id,name,date,is_active,registration_open,created_at,updated_at")
      .single();

    if (error) throw error;

    const created = row as Competition;
    setCompetitions((prev) => [...prev, created]);
    setSelectedId(created.id);
    return created;
  };

  const updateCompetition: CompetitionContextType["updateCompetition"] = async (id, patch) => {
    const { data: row, error } = await supabase
      .from("competitions")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id,name,date,is_active,registration_open,created_at,updated_at")
      .single();

    if (error) throw error;

    const updated = row as Competition;
    setCompetitions((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  };

  const deleteCompetition: CompetitionContextType["deleteCompetition"] = async (id) => {
    const { error } = await supabase.from("competitions").delete().eq("id", id);
    if (error) throw error;

    setCompetitions((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) {
      const remainingActive = competitions.filter((c) => c.id !== id && c.is_active);
      setSelectedId(remainingActive[0]?.id ?? null);
    }
  };

  return (
    <CompetitionContext.Provider
      value={{
        competitions,
        activeCompetitions,
        archivedCompetitions,
        loading,
        selected,
        setSelected,
        refresh,
        createCompetition,
        updateCompetition,
        deleteCompetition,
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
