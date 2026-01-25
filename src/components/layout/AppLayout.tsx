import { ReactNode, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCompetition } from '@/contexts/CompetitionContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Menu, Trophy, Shield, LogOut, User2, ClipboardList } from 'lucide-react';

type Props = { children: ReactNode };

export default function AppLayout({ children }: Props) {
  const location = useLocation();
  const { user, isAdmin, isScorer, signOut } = useAuth();

  const {
    competition,
    selectableActiveCompetitions,
    selectedCompetitionId,
    selectCompetition,
  } = useCompetition();

  const navItems = useMemo(() => {
    const base = [
      { to: '/', label: 'Poäng', icon: Trophy },
      { to: '/profile', label: 'Profil', icon: User2 },
    ];

    // Let scorers always access apply page (to request more competitions)
    if (isScorer && !isAdmin) {
      base.push({ to: '/apply', label: 'Ansök', icon: ClipboardList });
    }

    if (isAdmin) {
      base.push({ to: '/admin', label: 'Administration', icon: Shield });
      base.push({ to: '/competitions', label: 'Tävlingar', icon: Trophy });
    }

    return base;
  }, [isAdmin, isScorer]);

  const showCompetitionDropdown = isScorer && !isAdmin && selectableActiveCompetitions.length >= 2;
  const showNoOpenCompetitionNotice = isScorer && !isAdmin && selectableActiveCompetitions.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Öppna meny">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  <span className="font-semibold">ScoutScore</span>
                </div>

                <Separator className="my-4" />

                <nav className="flex flex-col gap-1">
                  {navItems.map((item) => {
                    const active = location.pathname === item.to;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                          active ? 'bg-muted font-medium' : 'hover:bg-muted'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>

                <Separator className="my-4" />

                <Button variant="outline" className="w-full" onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logga ut
                </Button>
              </SheetContent>
            </Sheet>

            <Link to="/" className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              <span className="font-semibold">ScoutScore</span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {/* Competition display/selector */}
            {isAdmin ? (
              competition ? (
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  {competition.name}
                </Badge>
              ) : null
            ) : showNoOpenCompetitionNotice ? (
              <div className="hidden sm:flex items-center gap-2">
                <Badge variant="destructive">Ingen öppen tävling</Badge>
                <Button asChild size="sm" variant="outline">
                  <Link to="/apply">Ansök om behörighet</Link>
                </Button>
              </div>
            ) : showCompetitionDropdown ? (
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Tävling:</span>
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={selectedCompetitionId ?? ''}
                  onChange={(e) => selectCompetition(e.target.value)}
                >
                  {selectableActiveCompetitions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : isScorer && !isAdmin && competition ? (
              <div className="hidden sm:flex items-center gap-2">
                <Badge variant="secondary">{competition.name}</Badge>
                <Button asChild size="sm" variant="outline">
                  <Link to="/apply">Ansök fler</Link>
                </Button>
              </div>
            ) : null}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="px-2">
                  <span className="text-sm text-muted-foreground hidden sm:inline">
                    {user?.email ?? 'Konto'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/profile">
                    <User2 className="mr-2 h-4 w-4" />
                    Profil
                  </Link>
                </DropdownMenuItem>

                {isScorer && !isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/apply">
                      <ClipboardList className="mr-2 h-4 w-4" />
                      Ansök om behörighet
                    </Link>
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logga ut
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
