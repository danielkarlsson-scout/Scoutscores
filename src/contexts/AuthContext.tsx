import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { ScoutSection } from "@/types/competition";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;

  isGlobalAdmin: boolean;
  isCompetitionAdmin: boolean; // scoped to selectedCompetitionId
  isAdmin: boolean;
  isScorer: boolean; // scoped to selectedCompetitionId

  selectedCompetitionId: string | null;

  canScoreSection: (section: ScoutSection) => boolean;
  refreshRoles: () => Promise<void>;

  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_SELECTED_KEY = "selectedCompetitionId";

/**
 * NOTE:
 * localStorage 'storage' event triggas inte i samma tab som gör setItem().
 * Därför lyssnar vi även på ett custom event som CompetitionContext dispatchar.
 */
const SELECTED_EVENT = "selectedCompetitionIdChanged";

function readSelectedCompetitionId(): string | null {
  try {
    return localStorage.getItem(AUTH_SELECTED_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(() =>
    readSelectedCompetitionId()
  );

  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [isCompetitionAdmin, setIsCompetitionAdmin] = useState(false);
  const [isScorer, setIsScorer] = useState(false);

  // skydda mot request-storms (t.ex. dubbel-mount / snabba state-changes)
  const rolesInFlightRef = useRef(false);
  const lastRolesKeyRef = useRef<string>("");

  const resetRoleState = useCallback(() => {
    setIsGlobalAdmin(false);
    setIsCompetitionAdmin(false);
    setIsScorer(false);
  }, []);

  const fetchRoles = useCallback(async () => {
    const uid = user?.id ?? "";
    const cid = selectedCompetitionId ?? "";
    const key = `${uid}:${cid}`;

    if (!user) {
      resetRoleState();
      return;
    }

    // undvik parallella körningar + spamma inte samma key
    if (rolesInFlightRef.current) return;
    if (lastRolesKeyRef.current === key) return;

    rolesInFlightRef.current = true;
    lastRolesKeyRef.current = key;

    try {
      // ✅ GLOBAL ADMIN (rpc)
      const { data: isGlobal, error: globalErr } = await supabase.rpc("is_global_admin");
      if (globalErr) throw globalErr;
      setIsGlobalAdmin(!!isGlobal);

      // ✅ COMPETITION ADMIN (scoped to selectedCompetitionId)
      if (selectedCompetitionId) {
        const { data: isCompAdmin, error: compErr } = await supabase.rpc(
          "is_competition_admin",
          { p_competition_id: selectedCompetitionId }
        );
        if (compErr) throw compErr;
        setIsCompetitionAdmin(!!isCompAdmin);

        // ✅ SCORER (scoped) via rpc (RLS-safe)
        const { data: isScorerData, error: scorerErr } = await supabase.rpc(
          "has_competition_role",
          { p_competition_id: selectedCompetitionId, p_role: "scorer" }
        );
        if (scorerErr) throw scorerErr;
        setIsScorer(!!isScorerData);
      } else {
        setIsCompetitionAdmin(false);
        setIsScorer(false);
      }
    } catch (e) {
      console.error("Auth role fetch failed:", e);
      resetRoleState();
    } finally {
      rolesInFlightRef.current = false;
    }
  }, [user, selectedCompetitionId, resetRoleState]);

  // keep selectedCompetitionId synced (storage + custom event)
  useEffect(() => {
    const sync = () => setSelectedCompetitionId(readSelectedCompetitionId());

    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_SELECTED_KEY) sync();
    };

    const onCustom = () => sync();

    window.addEventListener("storage", onStorage);
    window.addEventListener(SELECTED_EVENT, onCustom as EventListener);

    // initial sync (in case something set localStorage before provider mounts)
    sync();

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SELECTED_EVENT, onCustom as EventListener);
    };
  }, []);

  // auth session wiring
  useEffect(() => {
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_evt, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        setLoading(false);

        // när session ändras, tvinga ny roll-fetch
        lastRolesKeyRef.current = "";
      });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);

      lastRolesKeyRef.current = "";
    });

    return () => subscription.unsubscribe();
  }, []);

  // fetch roles when user/selectedCompetitionId changes
  useEffect(() => {
    if (user) fetchRoles();
    else resetRoleState();
  }, [user, selectedCompetitionId, fetchRoles, resetRoleState]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
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
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    resetRoleState();
  }, [resetRoleState]);

  // just nu: om global/comp-admin => allt, annars scorer (scoped) => allt inom sin tävling
  const canScoreSection = useCallback((_section: ScoutSection) => {
    if (isGlobalAdmin || isCompetitionAdmin) return true;
    return isScorer;
  }, [isGlobalAdmin, isCompetitionAdmin, isScorer]);

  const isAdmin = useMemo(() => isGlobalAdmin || isCompetitionAdmin, [isGlobalAdmin, isCompetitionAdmin]);

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
