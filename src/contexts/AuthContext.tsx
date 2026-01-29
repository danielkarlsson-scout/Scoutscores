import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { ScoutSection } from "@/types/competition";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;

  isGlobalAdmin: boolean;
  isCompetitionAdmin: boolean;
  isAdmin: boolean;
  isScorer: boolean;

  // Alltid definierad array så .length aldrig kraschar
  adminCompetitionIds: string[];

  selectedCompetitionId: string | null;

  canScoreSection: (section: ScoutSection) => boolean;
  refreshRoles: () => Promise<void>;

  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getSelectedCompetitionId(): string | null {
  try {
    return localStorage.getItem("selectedCompetitionId");
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

  // Alltid definierad array – men vi fyller den inte längre från competition_admins
  const [adminCompetitionIds, setAdminCompetitionIds] = useState<string[]>([]);

  const selectedCompetitionId = getSelectedCompetitionId();

  const resetRoles = () => {
    setIsGlobalAdmin(false);
    setIsCompetitionAdmin(false);
    setIsScorer(false);
    setAdminCompetitionIds([]);
  };

  const fetchRoles = useCallback(async () => {
    if (!user) {
      resetRoles();
      return;
    }

    try {
      // ✅ GLOBAL ADMIN (via RPC, inte user_roles direkt)
      const { data: isGlobal } = await supabase.rpc("is_global_admin");
      setIsGlobalAdmin(!!isGlobal);

      // ✅ COMPETITION ADMIN för vald tävling (via RPC, inte select på competition_admins)
      if (selectedCompetitionId) {
        const { data: isCompAdmin } = await supabase.rpc(
          "is_competition_admin",
          { p_competition_id: selectedCompetitionId }
        );
        setIsCompetitionAdmin(!!isCompAdmin);
      } else {
        setIsCompetitionAdmin(false);
      }

      // ❌ INGA DIREKTA SELECTS PÅ scorer_permissions / competition_admins
      // Här kan du senare lägga in en säker RPC, t.ex. is_any_scorer()
      setIsScorer(false);
      setAdminCompetitionIds([]); // tills du har en RPC som returnerar ids

    } catch (e) {
      console.error("Auth role fetch failed", e);
      resetRoles();
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
        resetRoles();
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user) fetchRoles();
      else resetRoles();
    });

    return () => subscription.unsubscribe();
  }, [fetchRoles]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const redirectTo = import.meta.env.PROD
      ? "https://scoutscores.vercel.app/verify-email"
      : "http://localhost:5173/verify-email";

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    });

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    resetRoles();
  };

  // Just nu: section används inte, men signaturen får ligga kvar
  const canScoreSection = (_section: ScoutSection) => {
    if (isGlobalAdmin || isCompetitionAdmin) return true;
    return isScorer;
  };

  const isAdmin =
    isGlobalAdmin ||
    isCompetitionAdmin ||
    adminCompetitionIds.length > 0;

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
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
