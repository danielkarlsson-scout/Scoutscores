import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type ProtectedRouteProps = {
  children: React.ReactNode;
  requireAdmin?: boolean;
};

/**
 * Regeln:
 * - Ej inloggad -> /login
 * - Inloggad men saknar roller (varken admin eller scorer) -> /awaiting-access
 * - requireAdmin:
 *    - admin -> ok
 *    - scorer -> /scoring
 *    - annars -> /awaiting-access
 */
export function ProtectedRoute({ children, requireAdmin }: ProtectedRouteProps) {
  const { user, loading, isAdmin, isScorer } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-muted-foreground">
        Laddar…
      </div>
    );
  }

  // Inte inloggad
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const hasAnyRole = isAdmin || isScorer;

  // Inloggad men ingen roll -> alltid till ansökan
  if (!hasAnyRole) {
    // undvik loop om man redan är där
    if (location.pathname !== "/awaiting-access") {
      return (
        <Navigate
          to="/awaiting-access"
          state={{ from: location }}
          replace
        />
      );
    }
    return <>{children}</>;
  }

  // Kräver admin
  if (requireAdmin && !isAdmin) {
    // scorers ska landa i scoring, inte i ansökan
    const fallback = isScorer ? "/scoring" : "/awaiting-access";
    if (location.pathname !== fallback) {
      return <Navigate to={fallback} state={{ from: location }} replace />;
    }
  }

  return <>{children}</>;
}
