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

  // alltid definierad array
  adminCompetitionIds: string[];
  scorerSections: ScoutSection[];

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

  const [adminCompetitionIds, setAdminCompetitionIds] = useState<string[]>([]);
  const [scorerSections, setScorerSections] = useState<ScoutSection[]>([]);

  const selectedCompetitionId = getSelectedCompetitionId();

  const resetRoleState = useCallback(() => {
    setIsGlobalAdmin(false);
    setIsCompetitionAdmin(false);
    setIsScorer(false);
    setAdminCompetitionIds([]);
    setScorerSections([]);
  }, []);

  const fetchRoles = useCallback(async () => {
    if (!user) {
      resetRoleState();
      return;
    }

    // nästa-state lokalt (så vi sätter allt atomiskt sist)
    let nextIsGlobalAdmin = false;
    let nextAdminCompetitionIds: string[] = [];
    let nextIsCompetitionAdmin = false;
    let nextScorerSections: ScoutSection[] = [];
    let nextIsScorer = false;

    // 1) Global admin via RPC (funkar i din DB)
    try {
      const { data, error } = await supabase.rpc("is_global_admin");
      if (error) {
        console.warn("is_global_admin failed:", error);
      } else {
        nextIsGlobalAdmin = !!data;
      }
    } catch (e) {
      console.warn("is_global_admin threw:", e);
    }

    // 2) Competition admin: använd TABELLEN competition_admins (undvik RPC-overload helt)
    //    (och undvik user_competition_roles som inte matchar din tabellstruktur)
    try {
      const { data, error } = await supabase
        .from("competition_admins")
        .select("competition_id")
        .eq("user_id", user.id);

      if (error) {
        console.warn("competition_admins select failed:", error);
      } else {
        nextAdminCompetitionIds = (data ?? [])
          .map((r: any) => String(r.competition_id))
          .filter(Boolean);
      }
    } catch (e) {
      console.warn("competition_admins select threw:", e);
    }

    // 3) Är admin i vald tävling?
    if (selectedCompetitionId) {
      nextIsCompetitionAdmin =
        nextIsGlobalAdmin || nextAdminCompetitionIds.includes(selectedCompetitionId);
    } else {
      nextIsCompetitionAdmin = nextIsGlobalAdmin || nextAdminCompetitionIds.length > 0;
    }

    // 4) Scorer sections (för vald tävling) från scorer_permissions
    if (selectedCompetitionId) {
      try {
        const { data, error } = await supabase
          .from("scorer_permissions")
          .select("section")
          .eq("user_id", user.id)
          .eq("competition_id", selectedCompetitionId);

        if (error) {
          console.warn("scorer_permissions select failed:", error);
        } else {
          nextScorerSections = (data ?? [])
            .map((r: any) => r.section as ScoutSection)
            .filter(Boolean);
        }
      } catch (e) {
        console.warn("scorer_permissions select threw:", e);
      }
    }

    // 5) Är scorer?
    //    - Alla admins ska få scora (du vill att admin alltid kan sätta poäng)
    //    - Annars: scorer om minst en section finns
    if (nextIsGlobalAdmin || nextIsCompetitionAdmin) {
      nextIsScorer = true;
    } else {
      nextIsScorer = nextScorerSections.length > 0;
    }

    setIsGlobalAdmin(nextIsGlobalAdmin);
    setAdminCompetitionIds(nextAdminCompetitionIds);
    setIsCompetitionAdmin(nextIsCompetitionAdmin);
    setScorerSections(nextScorerSections);
    setIsScorer(nextIsScorer);
  }, [user, selectedCompetitionId, resetRoleState]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);

      if (s?.user) {
        void fetchRoles();
      } else {
        resetRoleState();
      }
    });

    supabase.auth.getSession().then(({ data: sessionData }) => {
      setSession(sessionData.session);
      setUser(sessionData.session?.user ?? null);
      setLoading(false);

      if (sessionData.session?.user) {
        void fetchRoles();
      } else {
        resetRoleState();
      }
    });

    // supabase typings kan variera mellan versioner
    // @ts-ignore
    return () => data?.subscription?.unsubscribe?.();
  }, [fetchRoles, resetRoleState]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
    resetRoleState();
  };

  const isAdmin = useMemo(() => {
    return isGlobalAdmin || isCompetitionAdmin || (adminCompetitionIds?.length ?? 0) > 0;
  }, [isGlobalAdmin, isCompetitionAdmin, adminCompetitionIds]);

  const canScoreSection = (section: ScoutSection) => {
    if (isGlobalAdmin || isCompetitionAdmin) return true;
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
        adminCompetitionIds,
        scorerSections,
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
