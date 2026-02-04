import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
  useCallback,
  useMemo,
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

const AUTH_SELECTED_KEY = "selectedCompetitionId";
const SELECTED_KEY = "scout-selected-competition";
const SELECTED_CHANGED_EVENT = "scout:selected-competition-changed";

function readSelectedCompetitionId(): string | null {
  try {
    return (
      localStorage.getItem(AUTH_SELECTED_KEY) ||
      localStorage.getItem(SELECTED_KEY) ||
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

  // Keep selected competition in state (stable deps + can update in same tab)
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(() =>
    readSelectedCompetitionId()
  );

  // Sync selectedCompetitionId when CompetitionContext updates localStorage.
  // NOTE: 'storage' only fires across tabs; same-tab updates need a custom event.
  useEffect(() => {
    const sync = () => setSelectedCompetitionId(readSelectedCompetitionId());

    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_SELECTED_KEY || e.key === SELECTED_KEY) sync();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(SELECTED_CHANGED_EVENT, sync as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SELECTED_CHANGED_EVENT, sync as EventListener);
    };
  }, []);

  const fetchRoles = useCallback(async () => {
    if (!user) {
      setIsGlobalAdmin(false);
      setIsCompetitionAdmin(false);
      setIsScorer(false);
      setAdminCompetitionIds([]);
      return;
    }

    try {
      // 1) GLOBAL ADMIN via RPC
      const { data: globalData, error: globalErr } = await supabase.rpc("is_global_admin");
      if (globalErr) throw globalErr;
      const globalAdmin = !!globalData;
      setIsGlobalAdmin(globalAdmin);

      // 2) COMPETITION ADMIN for selected competition (if any)
      if (selectedCompetitionId) {
        const { data: compAdminData, error: compAdminErr } = await supabase.rpc(
          "is_competition_admin",
          { p_competition_id: selectedCompetitionId }
        );

        if (compAdminErr) {
          console.warn("is_competition_admin failed:", compAdminErr);
          setIsCompetitionAdmin(false);
        } else {
          setIsCompetitionAdmin(!!compAdminData);
        }
      } else {
        setIsCompetitionAdmin(false);
      }

      // 3) SCORER for selected competition (if any)
      if (selectedCompetitionId) {
        const { data: scorerData, error: scorerErr } = await supabase.rpc("has_competition_role", {
          p_competition_id: selectedCompetitionId,
          p_role: "scorer",
        });

        if (scorerErr) {
          console.warn("has_competition_role failed:", scorerErr);
          setIsScorer(false);
        } else {
          setIsScorer(!!scorerData);
        }
      } else {
        setIsScorer(false);
      }

      // 4) Admin competition ids (used by UI)
      const { data: ucrRows, error: ucrErr } = await supabase
        .from("user_competition_roles")
        .select("competition_id")
        .eq("user_id", user.id);

      if (ucrErr) {
        console.warn("Could not load user_competition_roles:", ucrErr);
        setAdminCompetitionIds([]);
      } else {
        const ids = (ucrRows ?? []).map((r: any) => String(r.competition_id));
        setAdminCompetitionIds(ids);
      }

      // If global admin, adminCompetitionIds might be empty; that's fine.
      // We keep it as "direct admin roles", while isGlobalAdmin is separate.
      void globalAdmin;
    } catch (e) {
      console.error("Auth role fetch failed", e);
      setIsGlobalAdmin(false);
      setIsCompetitionAdmin(false);
      setIsScorer(false);
      setAdminCompetitionIds([]);
    }
  }, [user, selectedCompetitionId]);

  // Avoid re-subscribing when fetchRoles changes
  const fetchRolesRef = useRef(fetchRoles);
  useEffect(() => {
    fetchRolesRef.current = fetchRoles;
  }, [fetchRoles]);

  // Subscribe ONCE. onAuthStateChange fires INITIAL_SESSION on load in Supabase v2.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);

      if (s?.user) {
        // One role refresh per auth session transition (no double boot)
        void fetchRolesRef.current();
      } else {
        setIsGlobalAdmin(false);
        setIsCompetitionAdmin(false);
        setIsScorer(false);
        setAdminCompetitionIds([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
    () => isGlobalAdmin || isCompetitionAdmin || adminCompetitionIds.length > 0,
    [isGlobalAdmin, isCompetitionAdmin, adminCompetitionIds.length]
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
