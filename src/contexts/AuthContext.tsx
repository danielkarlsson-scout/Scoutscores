import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { ScoutSection } from '@/types/competition';

export type AppRole = 'admin' | 'scorer';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;

  /** Global admin (superuser) – can only be granted in DB */
  isGlobalAdmin: boolean;

  /** Competition admin for the currently selected competition (scoped admin) */
  isCompetitionAdmin: boolean;

  /** Convenience: any admin (global OR competition-scoped) for the selected competition */
  isAdmin: boolean;

  isScorer: boolean;
  scorerSections: ScoutSection[];

  /** Competition IDs where the user is competition admin */
  adminCompetitionIds: string[];

  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;

  canScoreSection: (section: ScoutSection) => boolean;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to query tables that may not be in types yet
const queryTable = (tableName: string) => {
  return (supabase as any).from(tableName);
};

function getSelectedCompetitionId(): string | null {
  try {
    return window.localStorage.getItem('selectedCompetitionId');
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [isScorer, setIsScorer] = useState(false);
  const [scorerSections, setScorerSections] = useState<ScoutSection[]>([]);
  const [adminCompetitionIds, setAdminCompetitionIds] = useState<string[]>([]);

  const fetchRoles = async (userId: string) => {
    try {
      // 1) Global roles (user_roles)
      const { data: roles, error: rolesErr } = await queryTable('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (rolesErr) throw rolesErr;

      const hasGlobalAdmin = roles?.some((r: any) => r.role === 'admin') ?? false;
      const hasScorerRole = roles?.some((r: any) => r.role === 'scorer') ?? false;

      setIsGlobalAdmin(hasGlobalAdmin);
      setIsScorer(hasScorerRole);

      // 2) Competition admin memberships (competition_admins)
      const { data: ca, error: caErr } = await queryTable('competition_admins')
        .select('competition_id')
        .eq('user_id', userId);

      if (caErr) {
        // If table doesn't exist yet (during migration), fail soft
        console.warn('competition_admins query failed:', caErr);
        setAdminCompetitionIds([]);
      } else {
        setAdminCompetitionIds((ca?.map((r: any) => String(r.competition_id))) ?? []);
      }

      // 3) Scorer permissions
      if (hasScorerRole || hasGlobalAdmin) {
        const { data: permissions, error: permErr } = await queryTable('scorer_permissions')
          .select('section')
          .eq('user_id', userId);

        if (permErr) throw permErr;

        setScorerSections((permissions?.map((p: any) => p.section as ScoutSection)) ?? []);
      } else {
        setScorerSections([]);
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
      setIsGlobalAdmin(false);
      setIsScorer(false);
      setScorerSections([]);
      setAdminCompetitionIds([]);
    }
  };

  const refreshRoles = async () => {
    if (user) {
      await fetchRoles(user.id);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Use setTimeout to avoid deadlock with Supabase client
        setTimeout(() => fetchRoles(session.user.id), 0);
      } else {
        setIsGlobalAdmin(false);
        setIsScorer(false);
        setScorerSections([]);
        setAdminCompetitionIds([]);
      }

      setLoading(false);
    });

    supabase.auth.getSession().then(({
      data: { session },
    }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchRoles(session.user.id);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  // ✅ UPPDATERAD: alltid rätt redirect för verifieringsmail
  const signUp = async (email: string, password: string) => {
    const redirectTo =
      import.meta.env.PROD
        ? 'https://scoutscores.vercel.app/verify-email'
        : 'http://localhost:5173/verify-email';

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsGlobalAdmin(false);
    setIsScorer(false);
    setScorerSections([]);
    setAdminCompetitionIds([]);
  };

  const isCompetitionAdmin = useMemo(() => {
    if (isGlobalAdmin) return true; // global admin is always effectively competition admin
    const selectedId = getSelectedCompetitionId();
    if (!selectedId) return false;
    return adminCompetitionIds.includes(String(selectedId));
  }, [isGlobalAdmin, adminCompetitionIds]);

  const isAdmin = isGlobalAdmin || isCompetitionAdmin;

  const canScoreSection = (section: ScoutSection): boolean => {
    if (isAdmin) return true;
    if (!isScorer) return false;
    return scorerSections.includes(section);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isGlobalAdmin,
        isCompetitionAdmin,
        isAdmin,
        isScorer,
        scorerSections,
        adminCompetitionIds,
        signIn,
        signUp,
        signOut,
        canScoreSection,
        refreshRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
