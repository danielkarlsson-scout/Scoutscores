import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { ScoutSection } from '@/types/competition';

type Role = 'admin' | 'scorer';

export type ScorerPermission = {
  competitionId: string;
  section: ScoutSection;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;

  roles: Role[];
  isAdmin: boolean;
  isScorer: boolean;

  scorerPermissions: ScorerPermission[];

  // Optional helper (uses competitionId when supplied)
  canScoreSection: (section: ScoutSection, competitionId?: string) => boolean;

  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [roles, setRoles] = useState<Role[]>([]);
  const [scorerPermissions, setScorerPermissions] = useState<ScorerPermission[]>([]);

  const isAdmin = useMemo(() => roles.includes('admin'), [roles]);
  const isScorer = useMemo(() => roles.includes('scorer'), [roles]);

  const fetchUserData = async (u: User) => {
    // Roles
    const { data: rolesData, error: rolesError } = await (supabase as any)
      .from('user_roles')
      .select('role')
      .eq('user_id', u.id);

    if (!rolesError) {
      const r = (rolesData ?? [])
        .map((x: any) => x.role as Role)
        .filter(Boolean);
      setRoles(r);
    } else {
      setRoles([]);
    }

    // Scorer permissions (competition_id + section)
    const { data: permData, error: permError } = await (supabase as any)
      .from('scorer_permissions')
      .select('competition_id, section')
      .eq('user_id', u.id);

    if (!permError) {
      const perms: ScorerPermission[] = (permData ?? [])
        .filter((p: any) => p?.competition_id && p?.section)
        .map((p: any) => ({
          competitionId: p.competition_id as string,
          section: p.section as ScoutSection,
        }));
      setScorerPermissions(perms);
    } else {
      setScorerPermissions([]);
    }
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);

      if (data.session?.user) {
        await fetchUserData(data.session.user);
      } else {
        setRoles([]);
        setScorerPermissions([]);
      }

      setLoading(false);
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        setLoading(true);
        await fetchUserData(newSession.user);
        setLoading(false);
      } else {
        setRoles([]);
        setScorerPermissions([]);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const canScoreSection = (section: ScoutSection, competitionId?: string) => {
    if (isAdmin) return true;
    if (!isScorer) return false;

    if (!competitionId) {
      // If no competition is provided, allow if user has any permission for the section in any competition
      return scorerPermissions.some((p) => p.section === section);
    }

    return scorerPermissions.some((p) => p.competitionId === competitionId && p.section === section);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value: AuthContextType = {
    session,
    user,
    loading,

    roles,
    isAdmin,
    isScorer,

    scorerPermissions,
    canScoreSection,

    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
