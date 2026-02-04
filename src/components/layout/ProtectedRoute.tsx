import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type Props = {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireCompetitionSelected?: boolean;
};

export function ProtectedRoute({
  children,
  requireAdmin = false,
  requireCompetitionSelected = true,
}: Props) {
  const { user, loading, isAdmin, isScorer, selectedCompetitionId } = useAuth();
  const location = useLocation();

  if (loading) return null;

  // Inte inloggad
  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  // Om användaren saknar ALL access (varken scorer eller admin)
  // -> skicka till awaiting-access (men undvik loop)
  const hasAnyAccess = isAdmin || isScorer;
  if (!hasAnyAccess && location.pathname !== "/awaiting-access") {
    return <Navigate to="/awaiting-access" replace />;
  }

  // Admin-krav
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // Kräver vald tävling
  if (requireCompetitionSelected && hasAnyAccess && !selectedCompetitionId) {
    // Låt /competitions och /awaiting-access vara “safe”
    if (
      location.pathname !== "/competitions" &&
      location.pathname !== "/awaiting-access"
    ) {
      return <Navigate to="/competitions" replace />;
    }
  }

  return <>{children}</>;
}
