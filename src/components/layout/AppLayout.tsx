import React, { useState } from 'react';
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

import { useCompetition } from '@/contexts/CompetitionContext';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const {
    competition,
    scorerActiveCompetitions,
    selectCompetition,
    canSelectCompetition,
  } = useCompetition();

  const { user, isGlobalAdmin, isCompetitionAdmin, isScorer, signOut } = useAuth();
  const isAdmin = isGlobalAdmin || isCompetitionAdmin;

  const handleNavClick = () => {
    setMobileMenuOpen(false);
  };

  const getNavItems = () => {
    if (!user) return [];

    if (isAdmin) {
      return [
        { path: '/dashboard', label: 'Översikt', icon: LayoutDashboard },
        { path: '/competitions', label: 'Tävlingar', icon: Flag },
        { path: '/patrols', label: 'Patruller', icon: Users },
        { path: '/stations', label: 'Stationer', icon: ClipboardList },
        { path: '/scoreboard', label: 'Resultattavla', icon: Trophy },
      ];
    }

    if (isScorer) {
      return [
        { path: '/scoring', label: 'Poängregistrering', icon: ClipboardList },
        { path: '/scoreboard', label: 'Resultattavla', icon: Trophy },
      ];
    }

    return [];
  };

  const navItems = getNavItems();

  const handleSignOut = async () => {
    await signOut();
  };

  const scorerComps = scorerActiveCompetitions ?? [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/competitions" className="flex items-center gap-2">
            <TreePine className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold text-primary">ScoutScore</span>
          </Link>

          {/* Current Competition / Selector */}
          {(competition || (isScorer && !isAdmin && scorerComps.length > 0)) && (
            <div className="hidden lg:block">
              {isAdmin || !isScorer ? (
                <Link to={isAdmin ? "/competitions" : "/"}>
                  <Badge variant="outline" className="gap-1 px-3 py-1 text-xs hover:bg-muted">
                    <Trophy className="h-3 w-3" />
                    {competition?.name ?? "Välj tävling"}
                  </Badge>
                </Link>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Badge
                      role="button"
                      tabIndex={0}
                      variant="outline"
                      className="gap-1 px-3 py-1 text-xs hover:bg-muted cursor-pointer"
                    >
                      <Trophy className="h-3 w-3" />
                      {competition?.name ?? "Välj tävling"}
                    </Badge>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="min-w-64">
                    {scorerComps.map((c) => (
                      <DropdownMenuItem
                        key={c.id}
                        onClick={() => {
                          if (canSelectCompetition(c.id)) {
                            selectCompetition(c.id);
                          }
                        }}
                      >
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.date
                              ? new Date(c.date).toLocaleDateString("sv-SE")
                              : ""}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                    {scorerComps.length === 0 && (
                      <DropdownMenuItem disabled>
                        <span className="text-xs text-muted-foreground">
                          Inga aktiva tävlingar att välja.
                        </span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/awaiting-access">
                        <Shield className="mr-2 h-3 w-3" />
                        <span className="text-xs">Behörigheter & förfrågningar</span>
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}

          {/* Mobile menu toggle */}
          <button
            className="lg:hidden inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1 px-4 pb-2">
          {navItems.map((item) => (
            <Link
              key={item.path + item.label}
              to={item.path}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                location.pathname === item.path
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}

          <div className="ml-auto flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span>{user.email}</span>
                {isAdmin && (
                  <Badge variant="outline" className="ml-2">
                    Admin
                  </Badge>
                )}
                {isScorer && !isAdmin && (
                  <Badge variant="outline" className="ml-2">
                    Scorer
                  </Badge>
                )}
              </div>
            )}
            {user && (
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-3 w-3" />
                Logga ut
              </button>
            )}
          </div>
        </nav>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t bg-card px-4 py-3 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.path + item.label}
                to={item.path}
                onClick={handleNavClick}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  location.pathname === item.path
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6">{children}</main>
    </div>
  );
}
