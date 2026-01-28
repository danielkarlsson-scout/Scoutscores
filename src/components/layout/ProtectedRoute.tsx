import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import AwaitingAccess from '@/pages/AwaitingAccess';
import { useEffect, useState } from 'react';

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
  allowNoRoles = false,
}: ProtectedRouteProps) {
  const {
    user,
    loading,
    isGlobalAdmin,
    isCompetitionAdmin,
    isScorer,
    refreshRoles,
  } = useAuth();

  const isAdmin = isGlobalAdmin || isCompetitionAdmin;

  // If we detect "no roles loaded yet" for a logged-in user,
  // trigger a roles refresh and show loader briefly instead of immediately redirecting.
  const [attemptedRefresh, setAttemptedRefresh] = useState(false);
  const [refreshingRoles, setRefreshingRoles] = useState(false);

  useEffect(() => {
    // Only try refresh if:
    // - user is logged in
    // - initial auth loading finished
    // - and we currently see no roles (not admin and not scorer)
    // - and we haven't already attempted a refresh for this mount
    if (
      user &&
      !loading &&
      !isGlobalAdmin &&
      !isCompetitionAdmin &&
      !isScorer &&
      !attemptedRefresh
    ) {
      let mounted = true;
      setAttemptedRefresh(true);
      setRefreshingRoles(true);

      // call refreshRoles and wait for it (but guard with timeout)
      const t = setTimeout(() => {
        // fallback: stop loader after timeout
        if (mounted) setRefreshingRoles(false);
      }, 1400); // 1.4s timeout (short, keeps UX snappy)

      (async () => {
        try {
          await refreshRoles();
        } catch (e) {
          // ignore - refreshRoles already logs
        } finally {
          if (mounted) setRefreshingRoles(false);
        }
      })();

      return () => {
        mounted = false;
        clearTimeout(t);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  // show initial auth loading spinner
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

  // If we just triggered a roles refresh, show spinner while that is in progress
  if (refreshingRoles) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
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
