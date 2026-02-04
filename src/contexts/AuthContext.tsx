import {
  createContext,
  useContext,
  useEffect,
  useMemo,
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

    let nextIsGlobalAdmin = false;
    let nextIsCompetitionAdmin = false;
    let nextIsScorer = false;
    let nextAdminCompetitionIds: string[] = [];

    // 1) GLOBAL ADMIN via RPC
    try {
      const { data: globalData, error: globalErr } = await supabase.rpc(
        "is_global_admin"
      );
      if (globalErr) {
        console.warn("is_global_admin failed:", globalErr);
      } else {
        nextIsGlobalAdmin = !!globalData;
      }
    } catch (e) {
      console.warn("is_global_admin threw:", e);
    }

    // 2) COMPETITION ADMIN via RPC för vald tävling (om vald)
    if (selectedCompetitionId) {
      try {
        const { data: compAdminData, error: compAdminErr } =
          await supabase.rpc("is_competition_admin", {
            p_competition_id: selectedCompetitionId,
          });

        if (compAdminErr) {
          console.warn("is_competition_admin failed:", compAdminErr);
        } else {
          nextIsCompetitionAdmin = !!compAdminData;
        }
      } catch (e) {
        console.warn("is_competition_admin threw:", e);
      }
    }

    // 3) Hämta alla competition-roller från user_competition_roles
    try {
      const { data: ucrRows, error: ucrErr } = await supabase
        .from("user_competition_roles")
        .select("competition_id, role")
        .eq("user_id", user.id);

      if (ucrErr) {
        console.warn("Could not load user_competition_roles:", ucrErr);
      } else {
        nextAdminCompetitionIds = (ucrRows ?? [])
          .filter((r: any) => r.role === "admin")
          .map((r: any) => String(r.competition_id));
      }
    } catch (e) {
      console.warn("user_competition_roles select threw:", e);
    }

    // 4) Scorer via scorer_permissions (per tävling)
    if (selectedCompetitionId) {
      try {
        const { data: permRows, error: permErr } = await supabase
          .from("scorer_permissions")
          .select("id")
          .eq("user_id", user.id)
          .eq("competition_id", selectedCompetitionId)
          .limit(1);

        if (permErr) {
          console.warn("scorer_permissions select failed:", permErr);
        } else if (permRows && permRows.length > 0) {
          nextIsScorer = true;
        }
      } catch (e) {
        console.warn("scorer_permissions select threw:", e);
      }
    }

    // Competition-admins & global admins ska alltid få scora
    if (nextIsGlobalAdmin || nextIsCompetitionAdmin) {
      nextIsScorer = true;
    }

    setIsGlobalAdmin(nextIsGlobalAdmin);
    setIsCompetitionAdmin(nextIsCompetitionAdmin);
    setIsScorer(nextIsScorer);
    setAdminCompetitionIds(nextAdminCompetitionIds);
  }, [user, selectedCompetitionId]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      if (s?.user) {
        void fetchRoles();
      } else {
        setIsGlobalAdmin(false);
        setIsCompetitionAdmin(false);
        setIsScorer(false);
        setAdminCompetitionIds([]);
      }
    });

    // initial session
    supabase.auth.getSession().then(({ data: sessionData }) => {
      setSession(sessionData.session);
      setUser(sessionData.session?.user ?? null);
      setLoading(false);
      if (sessionData.session?.user) {
        void fetchRoles();
      } else {
        setAdminCompetitionIds([]);
      }
    });

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - supabase typings för subscription kan skilja sig
    return () => data?.subscription?.unsubscribe?.();
  }, [fetchRoles]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const redirectTo =
      import.meta.env.PROD
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
    setIsGlobalAdmin(false);
    setIsCompetitionAdmin(false);
    setIsScorer(false);
    setAdminCompetitionIds([]);
  };

  const canScoreSection = (_section: ScoutSection) => {
    if (isGlobalAdmin || isCompetitionAdmin) return true;
    return isScorer;
  };

  const isAdmin = useMemo(
    () =>
      isGlobalAdmin ||
      isCompetitionAdmin ||
      (adminCompetitionIds?.length ?? 0) > 0,
    [isGlobalAdmin, isCompetitionAdmin, adminCompetitionIds]
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
