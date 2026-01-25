import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  Flag, 
  Users, 
  ClipboardList, 
  Trophy,
  Menu,
  X,
  TreePine,
  FolderOpen,
  Building2,
  Shield,
  LogOut
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCompetition } from '@/contexts/CompetitionContext';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { competition } = useCompetition();
  const { user, isAdmin, isScorer, signOut } = useAuth();

  // Define nav items based on role
  const getNavItems = () => {
    // Scorers only see the scoring page
    if (isScorer && !isAdmin) {
      return [
        { path: '/scoring', label: 'Poäng', icon: ClipboardList },
      ];
    }

    // Admins see everything
    if (isAdmin) {
      return [
        { path: '/competitions', label: 'Tävlingar', icon: FolderOpen },
        { path: '/', label: 'Översikt', icon: LayoutDashboard },
        { path: '/stations', label: 'Stationer', icon: Flag },
        { path: '/scout-groups', label: 'Kårer', icon: Building2 },
        { path: '/patrols', label: 'Patruller', icon: Users },
        { path: '/scoring', label: 'Poäng', icon: ClipboardList },
        { path: '/scoreboard', label: 'Resultattavla', icon: Trophy },
        { path: '/admin', label: 'Admin', icon: Shield },
      ];
    }

    // Users without roles see nothing (they'll be shown AwaitingAccess page)
    return [];
  };

  const navItems = getNavItems();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/competitions" className="flex items-center gap-2">
            <TreePine className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold text-primary">ScoutScore</span>
          </Link>

          {/* Current Competition Badge */}
          {competition && (
            <Link to={isAdmin ? "/competitions" : "/"} className="hidden lg:block">
              <Badge variant="outline" className="gap-1 px-3 py-1 text-xs hover:bg-muted">
                <Trophy className="h-3 w-3" />
                {competition.name}
              </Badge>
            </Link>
          )}
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => (
              <Link
                key={item.path + item.label}
                to={item.path}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  location.pathname === item.path
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="ml-2 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t bg-card p-4">
            {competition && (
              <Link 
                to={isAdmin ? "/competitions" : "/"}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 px-4 py-2 mb-2 rounded-lg bg-muted"
              >
                <Trophy className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{competition.name}</span>
              </Link>
            )}
            <div className="flex flex-col gap-2">
              {navItems.map(item => (
                <Link
                  key={item.path + item.label}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                    location.pathname === item.path
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              ))}
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-5 w-5" />
                Logga ut
              </button>
            </div>
            {user && (
              <div className="mt-4 pt-4 border-t text-sm text-muted-foreground px-4">
                {user.email}
                {isAdmin && <Badge variant="secondary" className="ml-2">Admin</Badge>}
                {isScorer && !isAdmin && <Badge variant="outline" className="ml-2">Scorer</Badge>}
              </div>
            )}
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6">
        {children}
      </main>
    </div>
  );
}
