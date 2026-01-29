import {
  createContext,
  useContext,
  useEffect,
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

  // NYTT: alltid definierad array så .length aldrig kraschar
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

  // NYTT: defaulta alltid till tom array
  const [adminCompetitionIds, setAdminCompetitionIds] = useState<string[]>([]);

  const selectedCompetitionId = getSelectedCompetitionId();

  const fetchRoles = useCallback(async () => {
    if (!user) {
      // säkerställ säkra defaults om ingen user
      setIsGlobalAdmin(false);
      setIsCompetitionAdmin(false);
      setIsScorer(false);
      setAdminCompetitionIds([]);
      return;
    }

    try {
      // ✅ GLOBAL ADMIN (via function, inte user_roles)
      const { data: isGlobal } = await supabase.rpc('is_global_admin');
      const global = !!isGlobal;
      setIsGlobalAdmin(global);

      // ✅ COMPETITION ADMIN (för aktuell selectedCompetitionId)
      if (selectedCompetitionId) {
        const { data: isCompAdmin } = await supabase.rpc('is_competition_admin', {
          p_competition_id: selectedCompetitionId,
        });
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

      // NYTT: hämta alla competition_admins för denna användare (trygg array)
      // OBS: Kör inte detta för global admin (de kan sakna rader och du vill inte trigga onödiga fetch-loopar)
      if (global) {
        setAdminCompetitionIds([]);
      } else {
        const { data: compAdminRows, error: compAdminErr } = await supabase
          .from('competition_admins')
          .select('competition_id')
          .eq('user_id', user.id);

        if (compAdminErr) {
          console.warn('Could not load competition_admins:', compAdminErr);
          setAdminCompetitionIds([]);
        } else {
          const ids = (compAdminRows ?? []).map((r: any) =>
            String(r.competition_id)
          );
          setAdminCompetitionIds(ids);
        }
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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);

      if (s?.user) {
        fetchRoles();
      } else {
        // när utloggning/ingen session: säkra defaults
        setIsGlobalAdmin(false);
        setIsCompetitionAdmin(false);
        setIsScorer(false);
        setAdminCompetitionIds([]);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);

      if (data.session?.user) fetchRoles();
      else setAdminCompetitionIds([]);
    });

    return () => subscription.unsubscribe();
  }, [fetchRoles]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const redirectTo = import.meta.env.PROD
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

  const canScoreSection = (_section: ScoutSection) => {
    if (isGlobalAdmin || isCompetitionAdmin) return true;
    return isScorer;
  };

  const isAdmin =
    isGlobalAdmin || isCompetitionAdmin || adminCompetitionIds.length > 0;

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
