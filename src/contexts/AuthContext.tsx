import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { ScoutSection } from '@/types/competition';

export type AppRole = 'admin' | 'scorer';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isScorer: boolean;
  scorerSections: ScoutSection[];
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isScorer, setIsScorer] = useState(false);
  const [scorerSections, setScorerSections] = useState<ScoutSection[]>([]);

  const fetchRoles = async (userId: string) => {
    try {
      // Fetch user roles
      const { data: roles } = await queryTable('user_roles')
        .select('role')
        .eq('user_id', userId);

      const hasAdmin = roles?.some((r: any) => r.role === 'admin') ?? false;
      const hasScorer = roles?.some((r: any) => r.role === 'scorer') ?? false;

      setIsAdmin(hasAdmin);
      setIsScorer(hasScorer);

      // Fetch scorer permissions
      if (hasScorer || hasAdmin) {
        const { data: permissions } = await queryTable('scorer_permissions')
          .select('section')
          .eq('user_id', userId);

        setScorerSections((permissions?.map((p: any) => p.section as ScoutSection)) ?? []);
      } else {
        setScorerSections([]);
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
    }
  };

  const refreshRoles = async () => {
    if (user) {
      await fetchRoles(user.id);
    }
  };

  useEffect(() => {
    // Set up auth state listener BEFORE checking session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Use setTimeout to avoid deadlock with Supabase client
          setTimeout(() => fetchRoles(session.user.id), 0);
        } else {
          setIsAdmin(false);
          setIsScorer(false);
          setScorerSections([]);
        }

        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
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
    setIsAdmin(false);
    setIsScorer(false);
    setScorerSections([]);
  };

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
        isAdmin,
        isScorer,
        scorerSections,
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
