import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
  useCallback,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { ScoutSection } from '@/types/competition';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;

  isGlobalAdmin: boolean;
  isCompetitionAdmin: boolean;
  isAdmin: boolean;
  isScorer: boolean;

  selectedCompetitionId: string | null;

  canScoreSection: (section: ScoutSection) => boolean;
  refreshRoles: () => Promise<void>;

  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getSelectedCompetitionId(): string | null {
  try {
    return localStorage.getItem('selectedCompetitionId');
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [isCompetitionAdmin, setIsCompetitionAdmin] = useState(false);
  const [isScorer, setIsScorer] = useState(false);

  const selectedCompetitionId = getSelectedCompetitionId();

  const fetchRoles = useCallback(async () => {
    if (!user) return;

    try {
      // ✅ GLOBAL ADMIN (via function, inte user_roles)
      const { data: isGlobal } = await supabase.rpc('is_global_admin');
      setIsGlobalAdmin(!!isGlobal);

      // ✅ COMPETITION ADMIN
      if (selectedCompetitionId) {
        const { data: isCompAdmin } = await supabase.rpc(
          'is_competition_admin',
          { p_competition_id: selectedCompetitionId }
        );
        setIsCompetitionAdmin(!!isCompAdmin);
      } else {
        setIsCompetitionAdmin(false);
      }

      // ✅ SCORER (finns permissions?)
      const { data: perms, error } = await supabase
        .from('scorer_permissions')
        .select('section')
        .limit(1);

      setIsScorer(!error && (perms?.length ?? 0) > 0);

    } catch (e) {
      console.error('Auth role fetch failed', e);
      setIsGlobalAdmin(false);
      setIsCompetitionAdmin(false);
      setIsScorer(false);
    }
  }, [user, selectedCompetitionId]);

  useEffect(() => {
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_evt, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        setLoading(false);
        if (s?.user) fetchRoles();
      });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user) fetchRoles();
    });

    return () => subscription.unsubscribe();
  }, [fetchRoles]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const redirectTo =
      import.meta.env.PROD
        ? 'https://scoutscores.vercel.app/verify-email'
        : 'http://localhost:5173/verify-email';

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    });

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsGlobalAdmin(false);
    setIsCompetitionAdmin(false);
    setIsScorer(false);
  };

  const canScoreSection = () => {
    if (isGlobalAdmin || isCompetitionAdmin) return true;
    return isScorer;
  };

  const isAdmin = isGlobalAdmin || isCompetitionAdmin;

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
        selectedCompetitionId,
        canScoreSection,
        refreshRoles: fetchRoles,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
