// src/contexts/CompetitionContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
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

type Ctx = {
  competitions: Competition[];
  loading: boolean;
  selected?: Competition | null;
  setSelected: (c?: Competition | null) => void;
  refresh: () => Promise<void>;
  createCompetition: (payload: { name: string; date?: string; is_active?: boolean; registration_open?: boolean }) => Promise<void>;
  updateCompetition: (id: string, patch: Partial<Competition>) => Promise<void>;
};

const CompetitionContext = createContext<Ctx | undefined>(undefined);

export const useCompetition = () => {
  const c = useContext(CompetitionContext);
  if (!c) throw new Error("useCompetition must be used inside CompetitionProvider");
  return c;
};

export const CompetitionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Competition | null>(null);

  const fetchCompetitions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("competitions")
      .select("*")
      .order("date", { ascending: true });
    if (error) {
      console.error("Failed to fetch competitions", error);
      setCompetitions([]);
    } else {
      setCompetitions(data as Competition[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCompetitions();
    // optional: subscribe to realtime updates if you want
    // const sub = supabase.from('competitions').on('*', () => fetchCompetitions()).subscribe();
    // return () => supabase.removeSubscription(sub);
  }, []);

  const refresh = async () => fetchCompetitions();

  const createCompetition = async (payload: { name: string; date?: string; is_active?: boolean; registration_open?: boolean }) => {
    const { data, error } = await supabase.from("competitions").insert({
      name: payload.name,
      date: payload.date ?? null,
      is_active: !!payload.is_active,
      registration_open: !!payload.registration_open,
    }).select().single();
    if (error) throw error;
    // update local state
    setCompetitions((s) => [...s, data as Competition]);
  };

  const updateCompetition = async (id: string, patch: Partial<Competition>) => {
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("competitions").update(patch).eq("id", id).select().single();
    if (error) throw error;
    setCompetitions((s) => s.map((c) => (c.id === id ? (data as Competition) : c)));
    // keep selected in sync
    if (selected?.id === id) setSelected(data as Competition);
  };

  return (
    <CompetitionContext.Provider value={{
      competitions, loading, selected, setSelected, refresh, createCompetition, updateCompetition
    }}>
      {children}
    </CompetitionContext.Provider>
  );
};
