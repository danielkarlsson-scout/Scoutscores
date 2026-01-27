import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import AwaitingAccess from '@/pages/AwaitingAccess';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireScorer?: boolean;
  allowNoRoles?: boolean;
}

export function ProtectedRoute({ 
  children, 
  requireAdmin = false, 
  requireScorer = false,
  allowNoRoles = false 
}: ProtectedRouteProps) {
  const { user, loading, isGlobalAdmin, isCompetitionAdmin, isScorer } = useAuth();
  const isAdmin = isGlobalAdmin || isCompetitionAdmin;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If user has no roles and this route doesn't allow that, show awaiting access
  const hasAnyRole = isAdmin || isScorer;
  if (!hasAnyRole && !allowNoRoles) {
    return <AwaitingAccess />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (requireScorer && !isScorer && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
