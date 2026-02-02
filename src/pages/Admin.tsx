import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCompetition } from '@/contexts/CompetitionContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Shield, Users, Loader2, Clock, CheckCircle2, XCircle, Bell, Trophy, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { SCOUT_SECTIONS, type ScoutSection } from '@/types/competition';
import { SectionBadge } from '@/components/ui/section-badge';

const queryTable = (tableName: string) => (supabase as any).from(tableName);

interface UserWithRoles {
  userId: string;
  email: string;
  displayName: string | null;
  isGlobalAdmin: boolean;          // user_roles.role='admin'
  isScorer: boolean;               // user_roles.role='scorer'
  competitionAdminIds: string[];   // competition_admins.competition_id[]
  permissions: { competition_id: string | null; section: ScoutSection }[];
}

interface PermissionRequest {
  id: string;
  user_id: string;
  section: ScoutSection;
  competition_id: string | null;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  userEmail?: string;
  userDisplayName?: string | null;
  competitionName?: string;
}

export default function Admin() {
  const { isGlobalAdmin, user: currentUser } = useAuth();
  const { activeCompetitions, archivedCompetitions } = useCompetition();
  const { toast } = useToast();

  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [requests, setRequests] = useState<PermissionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);

  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>('');

  const allCompetitions = useMemo(
    () => [...(activeCompetitions ?? []), ...(archivedCompetitions ?? [])],
    [activeCompetitions, archivedCompetitions]
  );

  useEffect(() => {
    if (!selectedCompetitionId && allCompetitions.length > 0) {
      setSelectedCompetitionId(allCompetitions[0].id);
    }
  }, [allCompetitions, selectedCompetitionId]);

  const currentUserRow = useMemo(
    () => users.find(u => u.userId === currentUser?.id),
    [users, currentUser?.id]
  );

  const isCompetitionAdminForSelected = useMemo(() => {
    if (!selectedCompetitionId) return false;
    return !!currentUserRow?.competitionAdminIds?.includes(selectedCompetitionId);
  }, [currentUserRow, selectedCompetitionId]);

  const canSeeAdminPage = isGlobalAdmin || isCompetitionAdminForSelected;

  const fetchUsers = async () => {
    try {
      // profiles
      const { data: profiles, error: profilesError } = await queryTable('profiles')
        .select('user_id, email, display_name');

      if (profilesError) throw profilesError;

      // roles (global admin/scorer)
      const { data: roles, error: rolesError } = await queryTable('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // competition admins
      const { data: compAdmins, error: compAdminsError } = await queryTable('competition_admins')
        .select('competition_id, user_id');

      if (compAdminsError) throw compAdminsError;

      // scorer permissions
      const { data: permissions, error: permissionsError } = await queryTable('scorer_permissions')
        .select('user_id, competition_id, section');

      if (permissionsError) throw permissionsError;

      const usersWithRoles: UserWithRoles[] = (profiles ?? []).map((profile: any) => {
        const userRoles = roles?.filter((r: any) => r.user_id === profile.user_id) ?? [];
        const userPermissions = permissions?.filter((p: any) => p.user_id === profile.user_id) ?? [];
        const userCompAdmins = compAdmins?.filter((c: any) => c.user_id === profile.user_id) ?? [];

        return {
          userId: profile.user_id,
          email: profile.email,
          displayName: profile.display_name,
          isGlobalAdmin: userRoles.some((r: any) => r.role === 'admin'),
          isScorer: userRoles.some((r: any) => r.role === 'scorer'),
          competitionAdminIds: userCompAdmins.map((c: any) => c.competition_id),
          permissions: userPermissions.map((p: any) => ({
            competition_id: p.competition_id ?? null,
            section: p.section as ScoutSection,
          })),
        };
      });

      setUsers(usersWithRoles);
      return profiles ?? [];
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Kunde inte hämta användare',
        description: 'Ett fel uppstod vid hämtning av användare.',
        variant: 'destructive',
      });
      return [];
    }
  };

  const fetchRequests = async (profiles: any[]) => {
    try {
      const { data, error } = await queryTable('permission_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const enrichedRequests: PermissionRequest[] = (data ?? []).map((req: any) => {
        const profile = profiles?.find((p: any) => p.user_id === req.user_id);
        const competition = allCompetitions.find(c => c.id === req.competition_id);
        return {
          ...req,
          userEmail: profile?.email,
          userDisplayName: profile?.display_name,
          competitionName: competition?.name || 'Okänd tävling',
        };
      });

      setRequests(enrichedRequests);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    const profiles = await fetchUsers();
    await fetchRequests(profiles);
    setLoading(false);
  };

  useEffect(() => {
    // vi behöver users-laddning för att avgöra competition-admin för vald tävling
    // så vi laddar alltid när man är inloggad
    if (currentUser) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    // när competition ändras måste vi kunna visa rätt behörigheter
    // ingen extra fetch behövs, men om du vill kan du refresha:
    // fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompetitionId]);

  const handleApproveRequest = async (request: PermissionRequest) => {
    setProcessingRequest(request.id);
    try {
      // säkerställ scorer-roll (tävlingsadmin får skapa scorer)
      const user = users.find(u => u.userId === request.user_id);
      if (user && !user.isScorer) {
        const { error: rError } = await queryTable('user_roles')
          .insert({ user_id: request.user_id, role: 'scorer' });
        // om den redan finns får du ev unique error, ignorera det
        if (rError && !String(rError.message ?? '').toLowerCase().includes('duplicate')) {
          throw rError;
        }
      }

      // sätt permission per tävling+sektion
      const { error: pError } = await queryTable('scorer_permissions')
        .upsert(
          {
            user_id: request.user_id,
            competition_id: request.competition_id,
            section: request.section,
          },
          { onConflict: 'user_id,competition_id,section' }
        );
      if (pError) throw pError;

      // markera request som approved
      const { error: uError } = await queryTable('permission_requests')
        .update({
          status: 'approved',
          reviewed_by: currentUser?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', request.id);
      if (uError) throw uError;

      toast({ title: 'Ansökan godkänd', description: `Behörighet för ${SCOUT_SECTIONS[request.section].name} tilldelad.` });
      await fetchAll();
    } catch (error) {
      console.error('Error approving request:', error);
      toast({ title: 'Kunde inte godkänna ansökan', variant: 'destructive' });
    }
    setProcessingRequest(null);
  };

  const handleDenyRequest = async (request: PermissionRequest) => {
    setProcessingRequest(request.id);
    try {
      const { error } = await queryTable('permission_requests')
        .update({
          status: 'denied',
          reviewed_by: currentUser?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', request.id);
      if (error) throw error;

      toast({ title: 'Ansökan nekad' });
      await fetchAll();
    } catch (error) {
      console.error('Error denying request:', error);
      toast({ title: 'Kunde inte neka ansökan', variant: 'destructive' });
    }
    setProcessingRequest(null);
  };

  // ✅ "Admin" = Tävlingsadmin för vald tävling (competition_admins)
  const toggleCompetitionAdmin = async (user: UserWithRoles) => {
    if (!selectedCompetitionId) {
      toast({ title: 'Välj tävling först', variant: 'destructive' });
      return;
    }

    // endast global admin eller tävlingsadmin för vald tävling får toggla
    if (!isGlobalAdmin && !isCompetitionAdminForSelected) {
      toast({ title: 'Saknar behörighet', variant: 'destructive' });
      return;
    }

    setSaving(user.userId);
    try {
      const isAdminForSelected =
        user.isGlobalAdmin || user.competitionAdminIds.includes(selectedCompetitionId);

      if (isAdminForSelected) {
        // Ta bort tävlingsadmin (OBS: rör ej global admin)
        const { error } = await queryTable('competition_admins')
          .delete()
          .eq('competition_id', selectedCompetitionId)
          .eq('user_id', user.userId);
        if (error) throw error;
      } else {
        // Lägg till tävlingsadmin
        const { error } = await queryTable('competition_admins')
          .insert({ competition_id: selectedCompetitionId, user_id: user.userId });
        if (error) throw error;
      }

      await fetchAll();
      toast({ title: 'Tävlingsadmin uppdaterad' });
    } catch (error) {
      console.error('Error updating competition admin:', error);
      toast({ title: 'Kunde inte uppdatera tävlingsadmin', variant: 'destructive' });
    }
    setSaving(null);
  };

  const toggleScorerRole = async (user: UserWithRoles) => {
    setSaving(user.userId);
    try {
      if (user.isScorer) {
        const { error } = await queryTable('user_roles')
          .delete()
          .eq('user_id', user.userId)
          .eq('role', 'scorer');
        if (error) throw error;

        const { error: e2 } = await queryTable('scorer_permissions')
          .delete()
          .eq('user_id', user.userId);
        if (e2) throw e2;
      } else {
        const { error } = await queryTable('user_roles')
          .insert({ user_id: user.userId, role: 'scorer' });
        if (error) throw error;
      }
      await fetchAll();
      toast({ title: 'Roll uppdaterad' });
    } catch (error) {
      console.error('Error updating scorer role:', error);
      toast({ title: 'Kunde inte uppdatera roll', variant: 'destructive' });
    }
    setSaving(null);
  };

  const toggleSectionPermission = async (user: UserWithRoles, section: ScoutSection) => {
    if (!selectedCompetitionId) {
      toast({ title: 'Välj tävling först', variant: 'destructive' });
      return;
    }

    setSaving(user.userId);
    try {
      const hasSection = user.permissions.some(
        p => p.competition_id === selectedCompetitionId && p.section === section
      );

      if (hasSection) {
        const { error } = await queryTable('scorer_permissions')
          .delete()
          .eq('user_id', user.userId)
          .eq('competition_id', selectedCompetitionId)
          .eq('section', section);
        if (error) throw error;
      } else {
        const { error } = await queryTable('scorer_permissions')
          .insert({ user_id: user.userId, competition_id: selectedCompetitionId, section });
        if (error) throw error;
      }
      await fetchAll();
      toast({ title: 'Behörighet uppdaterad' });
    } catch (error) {
      console.error('Error updating permission:', error);
      toast({ title: 'Kunde inte uppdatera behörighet', variant: 'destructive' });
    }
    setSaving(null);
  };

  const deleteUser = async (user: UserWithRoles) => {
    setSaving(user.userId);
    try {
      await queryTable('scorer_permissions').delete().eq('user_id', user.userId);
      await queryTable('competition_admins').delete().eq('user_id', user.userId);
      await queryTable('user_roles').delete().eq('user_id', user.userId);
      await queryTable('permission_requests').delete().eq('user_id', user.userId);
      await queryTable('profiles').delete().eq('user_id', user.userId);

      toast({ title: 'Användare borttagen', description: `${user.email} har tagits bort.` });
      await fetchAll();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({ title: 'Kunde inte ta bort användare', variant: 'destructive' });
    }
    setSaving(null);
  };

  const sectionColors: Record<ScoutSection, string> = {
    sparare: 'bg-[hsl(200,70%,50%)] text-white hover:bg-[hsl(200,70%,45%)]',
    upptackare: 'bg-[hsl(150,60%,40%)] text-white hover:bg-[hsl(150,60%,35%)]',
    aventyrare: 'bg-[hsl(35,70%,50%)] text-white hover:bg-[hsl(35,70%,45%)]',
    utmanare: 'bg-[hsl(280,50%,45%)] text-white hover:bg-[hsl(280,50%,40%)]',
    rover: 'bg-[hsl(55,90%,45%)] text-black hover:bg-[hsl(55,90%,40%)]',
  } as any;

  const sectionOutlineColors: Record<ScoutSection, string> = {
    sparare: 'border-[hsl(200,70%,50%)] text-[hsl(200,70%,40%)] hover:bg-[hsl(200,70%,50%)] hover:text-white',
    upptackare: 'border-[hsl(150,60%,40%)] text-[hsl(150,60%,35%)] hover:bg-[hsl(150,60%,40%)] hover:text-white',
    aventyrare: 'border-[hsl(35,70%,50%)] text-[hsl(35,70%,45%)] hover:bg-[hsl(35,70%,50%)] hover:text-white',
    utmanare: 'border-[hsl(280,50%,45%)] text-[hsl(280,50%,40%)] hover:bg-[hsl(280,50%,45%)] hover:text-white',
    rover: 'border-[hsl(55,90%,45%)] text-[hsl(55,90%,35%)] hover:bg-[hsl(55,90%,45%)] hover:text-black',
  } as any;

  if (!canSeeAdminPage) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Administration</h1>
          <p className="text-muted-foreground">Hantera användare och behörigheter</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Åtkomst nekad</h3>
            <p className="text-muted-foreground text-center">Du har inte behörighet att se denna sida.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Administration</h1>
        <p className="text-muted-foreground">Hantera användare och behörigheter</p>
      </div>

      {requests.length > 0 && (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Väntande ansökningar
              <Badge variant="secondary">{requests.length}</Badge>
            </CardTitle>
            <CardDescription>Användare som ansökt om poängsättarbehörighet</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {requests.map(request => (
                <div key={request.id} className="flex items-center justify-between rounded-lg border p-4 bg-muted/50">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-medium">{request.userDisplayName || request.userEmail}</p>
                      {request.userDisplayName && <p className="text-sm text-muted-foreground">{request.userEmail}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        <Trophy className="inline h-3 w-3 mr-1" />
                        {request.competitionName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <Clock className="inline h-3 w-3 mr-1" />
                        {new Date(request.created_at).toLocaleString('sv-SE')}
                      </p>
                    </div>
                    <SectionBadge section={request.section} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => handleApproveRequest(request)} disabled={processingRequest === request.id}>
                      {processingRequest === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Godkänn
                        </>
                      )}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDenyRequest(request)} disabled={processingRequest === request.id}>
                      <XCircle className="h-4 w-4 mr-1" />
                      Neka
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Användare
          </CardTitle>
          <CardDescription>
            <div className="space-y-1">
              <div>
                “Admin” betyder <b>Tävlingsadmin</b> för vald tävling. 
              </div>
              <div>Scorers kan bara registrera poäng för sina tilldelade avdelningar (per tävling).</div>
            </div>
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Inga registrerade användare.</p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm text-muted-foreground">Tävling:</span>
                <select
                  className="border rounded-md px-3 py-2 text-sm bg-background"
                  value={selectedCompetitionId}
                  onChange={(e) => setSelectedCompetitionId(e.target.value)}
                >
                  {allCompetitions.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Användare</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Scorer</TableHead>
                    <TableHead>Avdelningar</TableHead>
                    <TableHead className="w-16">Åtgärder</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {users.map(u => {
                    const isAdminForSelected =
                      u.isGlobalAdmin || (selectedCompetitionId ? u.competitionAdminIds.includes(selectedCompetitionId) : false);

                    return (
                      <TableRow key={u.userId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-medium">{u.displayName || u.email}</p>
                              {u.displayName && <p className="text-sm text-muted-foreground">{u.email}</p>}
                            </div>
                            {u.isGlobalAdmin && <Badge variant="secondary">Global admin</Badge>}
                          </div>
                        </TableCell>

                        <TableCell>
                          {/* Tävlingsadmin-toggle */}
                          <Checkbox
                            checked={selectedCompetitionId ? u.competitionAdminIds.includes(selectedCompetitionId) : false}
                            onCheckedChange={() => toggleCompetitionAdmin(u)}
                            disabled={
                              saving === u.userId ||
                              !selectedCompetitionId ||
                              (!isGlobalAdmin && !isCompetitionAdminForSelected) ||
                              u.userId === currentUser?.id // valfritt: hindra att man tar bort sig själv
                            }
                          />
                        </TableCell>

                        <TableCell>
                          <Checkbox
                            checked={u.isScorer}
                            onCheckedChange={() => toggleScorerRole(u)}
                            disabled={saving === u.userId || isAdminForSelected}
                          />
                        </TableCell>

                        <TableCell>
                          {isAdminForSelected ? (
                            <Badge variant="secondary">Alla avdelningar</Badge>
                          ) : u.isScorer ? (
                            <div className="flex flex-wrap gap-2">
                              {(Object.keys(SCOUT_SECTIONS) as ScoutSection[]).map(section => {
                                const enabled = u.permissions.some(
                                  p => p.competition_id === selectedCompetitionId && p.section === section
                                );
                                return (
                                  <Badge
                                    key={section}
                                    variant="outline"
                                    className={cn(
                                      'cursor-pointer border transition-colors',
                                      enabled ? sectionColors[section] : sectionOutlineColors[section]
                                    )}
                                    onClick={() => toggleSectionPermission(u, section)}
                                  >
                                    {SCOUT_SECTIONS[section].name}
                                    {saving === u.userId && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
                                  </Badge>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Ingen behörighet</span>
                          )}
                        </TableCell>

                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={saving === u.userId || u.userId === currentUser?.id}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>

                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Ta bort användare?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Detta kommer att ta bort användaren "{u.displayName || u.email}" och all tillhörande data.
                                  Denna åtgärd går inte att ångra.
                                </AlertDialogDescription>
                              </AlertDialogHeader>

                              <AlertDialogFooter>
                                <AlertDialogCancel>Avbryt</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteUser(u)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Ta bort
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
