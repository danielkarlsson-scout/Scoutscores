import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

  adminCompetitionIds: string[];
  selectedCompetitionId: string | null;

  canScoreSection: (section: ScoutSection) => boolean;
  refreshRoles: () => Promise<void>;

  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SELECTED_KEY_A = "selectedCompetitionId";
const SELECTED_KEY_B = "scout-selected-competition";
const SELECTED_CHANGED_EVENT = "scout:selected-competition-changed";

function readSelectedCompetitionId(): string | null {
  try {
    return (
      localStorage.getItem(SELECTED_KEY_A) ||
      localStorage.getItem(SELECTED_KEY_B) ||
      null
    );
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

  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(
    () => readSelectedCompetitionId()
  );

  // Håll selectedCompetitionId i synk (andra tabs / CompetitionContext)
  useEffect(() => {
    const sync = () => setSelectedCompetitionId(readSelectedCompetitionId());

    const onStorage = (e: StorageEvent) => {
      if (e.key === SELECTED_KEY_A || e.key === SELECTED_KEY_B) sync();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(SELECTED_CHANGED_EVENT, sync as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SELECTED_CHANGED_EVENT, sync as EventListener);
    };
  }, []);

  // Stoppa request-storm: max en fetchRoles åt gången
  const rolesInFlightRef = useRef(false);

  const fetchRoles = useCallback(async () => {
    if (!user) {
      setIsGlobalAdmin(false);
      setIsCompetitionAdmin(false);
      setIsScorer(false);
      setAdminCompetitionIds([]);
      return;
    }

    if (rolesInFlightRef.current) return;
    rolesInFlightRef.current = true;

    try {
      let nextIsGlobalAdmin = false;
      let nextIsCompetitionAdmin = false;
      let nextIsScorer = false;
      let nextAdminCompetitionIds: string[] = [];

      // 1) GLOBAL ADMIN
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

      // 2) COMPETITION ADMIN (vald tävling)
      if (selectedCompetitionId) {
        try {
          const { data, error } = await supabase.rpc("is_competition_admin", {
            p_competition_id: selectedCompetitionId,
          });
          if (error) {
            console.warn("is_competition_admin failed:", error);
          } else {
            nextIsCompetitionAdmin = !!data;
          }
        } catch (e) {
          console.warn("is_competition_admin threw:", e);
        }
      }

      // 3) user_competition_roles
      try {
        const { data, error } = await supabase
          .from("user_competition_roles")
          .select("competition_id, role")
          .eq("user_id", user.id);

        if (error) {
          console.warn("Could not load user_competition_roles:", error);
        } else {
          nextAdminCompetitionIds = (data ?? [])
            .filter((r: any) => r.role === "admin")
            .map((r: any) => String(r.competition_id));
        }
      } catch (e) {
        console.warn("user_competition_roles select threw:", e);
      }

      // 4) scorer_permissions (per tävling)
      if (selectedCompetitionId) {
        try {
          const { data, error } = await supabase
            .from("scorer_permissions")
            .select("id")
            .eq("user_id", user.id)
            .eq("competition_id", selectedCompetitionId)
            .limit(1);

          if (error) {
            console.warn("scorer_permissions select failed:", error);
          } else if ((data ?? []).length > 0) {
            nextIsScorer = true;
          }
        } catch (e) {
          console.warn("scorer_permissions select threw:", e);
        }
      }

      if (nextIsGlobalAdmin || nextIsCompetitionAdmin) {
        nextIsScorer = true;
      }

      setIsGlobalAdmin(nextIsGlobalAdmin);
      setIsCompetitionAdmin(nextIsCompetitionAdmin);
      setIsScorer(nextIsScorer);
      setAdminCompetitionIds(nextAdminCompetitionIds);
    } finally {
      rolesInFlightRef.current = false;
    }
  }, [user, selectedCompetitionId]);

  // Håll ref till fetchRoles så vi inte behöver lägga den i dependency-array
  const fetchRolesRef = useRef(fetchRoles);
  useEffect(() => {
    fetchRolesRef.current = fetchRoles;
  }, [fetchRoles]);

  // EN auth-subscription, ingen getSession-loop
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);

      if (s?.user) {
        void fetchRolesRef.current();
      } else {
        setIsGlobalAdmin(false);
        setIsCompetitionAdmin(false);
        setIsScorer(false);
        setAdminCompetitionIds([]);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // När user eller selectedCompetitionId ändras → uppdatera roller en gång
  useEffect(() => {
    if (!user) return;
    void fetchRolesRef.current();
  }, [user, selectedCompetitionId]);

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
