import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireScorer?: boolean;
}

export function ProtectedRoute({
  children,
  requireAdmin = false,
  requireScorer = false,
}: Props) {
  const {
    user,
    loading,
    isAdmin,
    isScorer,
    isGlobalAdmin,
  } = useAuth();

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

  // 🔑 GLOBAL ADMIN FÅR ALDRIG FASTNA
  if (isGlobalAdmin) {
    return <>{children}</>;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (requireScorer && !isScorer && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
