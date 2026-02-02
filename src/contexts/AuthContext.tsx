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

  // alltid definierad array så .length aldrig kraschar
  adminCompetitionIds: string[];

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

  // defaulta alltid till tom array
  const [adminCompetitionIds, setAdminCompetitionIds] = useState<string[]>([]);

  const selectedCompetitionId = getSelectedCompetitionId();

  const fetchRoles = useCallback(async () => {
    if (!user) {
      // säkra defaults när ingen user
      setIsGlobalAdmin(false);
      setIsCompetitionAdmin(false);
      setIsScorer(false);
      setAdminCompetitionIds([]);
      return;
    }

    try {
      // GLOBAL ADMIN via RPC
      const { data: globalData, error: globalErr } = await supabase.rpc('is_global_admin');
      if (globalErr) throw globalErr;
      setIsGlobalAdmin(!!globalData);

      // COMPETITION ADMIN via RPC för vald tävling (om vald)
      if (selectedCompetitionId) {
        // work-around: om backend har överlagrade overloads kan det ge ambiguitet.
        // Vi skickar värdet som string (supabase-js gör JSON-serialisering) — om du får
        // "Could not choose the best candidate function" så behöver backend-funktionen
        // ha en tydlig signatur (se notes längst ner).
        const { data: compAdminData, error: compAdminErr } = await supabase.rpc(
          'is_competition_admin',
          { p_competition_id: selectedCompetitionId }
        );
        if (compAdminErr) {
          console.warn('is_competition_admin failed:', compAdminErr);
          setIsCompetitionAdmin(false);
        } else {
          setIsCompetitionAdmin(!!compAdminData);
        }
      } else {
        setIsCompetitionAdmin(false);
      }

      // SCORER via RPC helper has_competition_role(selectedCompetitionId,'scorer')
      if (selectedCompetitionId) {
        const { data: scorerData, error: scorerErr } = await supabase.rpc('has_competition_role', {
          p_competition_id: selectedCompetitionId,
          p_role: 'scorer',
        });
        if (scorerErr) {
          console.warn('has_competition_role failed:', scorerErr);
          setIsScorer(false);
        } else {
          setIsScorer(!!scorerData);
        }
      } else {
        setIsScorer(false);
      }

      // Hämta alla competition-roller från user_competition_roles (RLS ska tillåta SELECT på egna rader)
      const { data: ucrRows, error: ucrErr } = await supabase
        .from('user_competition_roles')
        .select('competition_id')
        .eq('user_id', user.id);

      if (ucrErr) {
        console.warn('Could not load user_competition_roles:', ucrErr);
        setAdminCompetitionIds([]);
      } else {
        const ids = (ucrRows ?? []).map((r: any) => String(r.competition_id));
        setAdminCompetitionIds(ids);
      }
    } catch (e) {
      console.error('Auth role fetch failed', e);
      setIsGlobalAdmin(false);
      setIsCompetitionAdmin(false);
      setIsScorer(false);
      setAdminCompetitionIds([]);
    }
  }, [user, selectedCompetitionId]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      if (s?.user) fetchRoles();
      else {
        setIsGlobalAdmin(false);
        setIsCompetitionAdmin(false);
        setIsScorer(false);
        setAdminCompetitionIds([]);
      }
    });

    // getSession
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user) fetchRoles();
      else setAdminCompetitionIds([]);
    });

    return () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - supabase typings for subscription can differ
      data?.subscription?.unsubscribe?.();
    };
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
    setAdminCompetitionIds([]);
  };

  const canScoreSection = (section: ScoutSection) => {
    if (isGlobalAdmin || isCompetitionAdmin) return true;
    return isScorer;
  };

  const isAdmin = isGlobalAdmin || isCompetitionAdmin || adminCompetitionIds.length > 0;

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
        adminCompetitionIds,
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
