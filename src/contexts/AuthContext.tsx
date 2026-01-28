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

export type AppRole = 'admin' | 'scorer';

type ScorerPermission = {
  competition_id: string;
  section: ScoutSection;
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;

  /** Global admin (superuser) – can only be granted in DB */
  isGlobalAdmin: boolean;

  /**
   * Competition admin for the currently selected competition (scoped admin).
   * Global admin => true.
   */
  isCompetitionAdmin: boolean;

  /** Convenience: any admin (global OR competition-scoped) for the selected competition */
  isAdmin: boolean;

  /**
   * True if user has the scorer role (in user_roles) OR is admin (admins can score too).
   * Note: actual scoring is controlled by canScoreSection/canScoreSectionFor.
   */
  isScorer: boolean;

  /** All competitions where the user is competition admin */
  adminCompetitionIds: string[];

  /** All scorer permissions across competitions */
  scorerPermissions: ScorerPermission[];

  /** For backwards compatibility (some UI might list sections without competition) */
  scorerSections: ScoutSection[];

  /** Selected competition ID (from localStorage) */
  selectedCompetitionId: string | null;

  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;

  /** Admin check for a specific competition */
  isCompetitionAdminFor: (competitionId: string | null | undefined) => boolean;

  /** Can score section for selected competition */
  canScoreSection: (section: ScoutSection) => boolean;

  /** Can score section for a specific competition */
  canScoreSectionFor: (competitionId: string | null | undefined, section: ScoutSection) => boolean;

  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to query tables that may not be in types yet
const queryTable = (tableName: string) => {
  return (supabase as any).from(tableName);
};

function safeGetSelectedCompetitionId(): string | null {
  try {
    const v = window.localStorage.getItem('selectedCompetitionId');
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [hasScorerRole, setHasScorerRole] = useState(false);

  const [adminCompetitionIds, setAdminCompetitionIds] = useState<string[]>([]);
  const [scorerPermissions, setScorerPermissions] = useState<ScorerPermission[]>([]);

  // keep selectedCompetitionId in state so UI reacts immediately
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(() =>
    safeGetSelectedCompetitionId()
  );

  // Listen for localStorage changes (e.g. competition switch in another tab or via code)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'selectedCompetitionId') {
        setSelectedCompetitionId(e.newValue && e.newValue.trim() ? e.newValue : null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Also refresh selectedCompetitionId periodically when this tab changes it (storage event doesn't fire in same tab)
  useEffect(() => {
    const id = window.setInterval(() => {
      const v = safeGetSelectedCompetitionId();
      setSelectedCompetitionId((prev) => (prev !== v ? v : prev));
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const fetchRoles = useCallback(async (userId: string) => {
    try {
      // 1) Global roles (user_roles)
      const { data: roles, error: rolesErr } = await queryTable('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (rolesErr) throw rolesErr;

      const globalAdmin = (roles ?? []).some((r: any) => r.role === 'admin');
      const scorerRole = (roles ?? []).some((r: any) => r.role === 'scorer');

      setIsGlobalAdmin(globalAdmin);
      setHasScorerRole(scorerRole);

      // 2) Competition admin memberships (competition_admins)
      const { data: ca, error: caErr } = await queryTable('competition_admins')
        .select('competition_id')
        .eq('user_id', userId);

      if (caErr) {
        console.warn('competition_admins query failed:', caErr);
        setAdminCompetitionIds([]);
      } else {
        setAdminCompetitionIds((ca ?? []).map((r: any) => String(r.competition_id)));
      }

      // 3) Scorer permissions (competition_id + section)
      // NOTE: we fetch for scorerRole OR admin (admins can act as scorer)
      if (scorerRole || globalAdmin) {
        const { data: perms, error: permErr } = await queryTable('scorer_permissions')
          .select('competition_id, section')
          .eq('user_id', userId);

        if (permErr) throw permErr;

        const mapped: ScorerPermission[] = (perms ?? [])
          .filter((p: any) => p.competition_id && p.section)
          .map((p: any) => ({
            competition_id: String(p.competition_id),
            section: p.section as ScoutSection,
          }));

        setScorerPermissions(mapped);
      } else {
        setScorerPermissions([]);
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
      setIsGlobalAdmin(false);
      setHasScorerRole(false);
      setAdminCompetitionIds([]);
      setScorerPermissions([]);
    }
  }, []);

  const refreshRoles = useCallback(async () => {
    if (user) await fetchRoles(user.id);
  }, [user, fetchRoles]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        // Avoid possible Supabase deadlock
        setTimeout(() => fetchRoles(nextSession.user.id), 0);
      } else {
        setIsGlobalAdmin(false);
        setHasScorerRole(false);
        setAdminCompetitionIds([]);
        setScorerPermissions([]);
      }

      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      if (initialSession?.user) {
        fetchRoles(initialSession.user.id);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchRoles]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  // ✅ Redirect för verifieringsmail
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
    setHasScorerRole(false);
    setAdminCompetitionIds([]);
    setScorerPermissions([]);
  };

  const isCompetitionAdminFor = useCallback(
    (competitionId: string | null | undefined) => {
      if (isGlobalAdmin) return true;
      if (!competitionId) return false;
      return adminCompetitionIds.includes(String(competitionId));
    },
    [isGlobalAdmin, adminCompetitionIds]
  );

  const isCompetitionAdmin = useMemo(() => {
    return isCompetitionAdminFor(selectedCompetitionId);
  }, [isCompetitionAdminFor, selectedCompetitionId]);

  const isAdmin = isGlobalAdmin || isCompetitionAdmin;

  // expose "isScorer" but remember: scoring is validated via canScoreSection
  const isScorer = hasScorerRole || isAdmin;

  // Back-compat list (unique sections across competitions)
  const scorerSections = useMemo(() => {
    const unique = new Set<ScoutSection>();
    for (const p of scorerPermissions) unique.add(p.section);
    return Array.from(unique);
  }, [scorerPermissions]);

  const canScoreSectionFor = useCallback(
    (competitionId: string | null | undefined, section: ScoutSection): boolean => {
      // Admin always can
      if (isCompetitionAdminFor(competitionId)) return true;

      // Must at least have scorer role
      if (!hasScorerRole) return false;

      // Must have explicit permission for that competition+section
      if (!competitionId) return false;

      return scorerPermissions.some(
        (p) => p.competition_id === String(competitionId) && p.section === section
      );
    },
    [isCompetitionAdminFor, hasScorerRole, scorerPermissions]
  );

  const canScoreSection = useCallback(
    (section: ScoutSection) => canScoreSectionFor(selectedCompetitionId, section),
    [canScoreSectionFor, selectedCompetitionId]
  );

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
        scorerPermissions,
        adminCompetitionIds,
        selectedCompetitionId,
        signIn,
        signUp,
        signOut,
        isCompetitionAdminFor,
        canScoreSection,
        canScoreSectionFor,
        refreshRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
