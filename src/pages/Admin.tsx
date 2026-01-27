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

// Helper to query tables that may not be in types yet
const queryTable = (tableName: string) => {
  return (supabase as any).from(tableName);
};

interface UserWithRoles {
  userId: string;
  email: string;
  displayName: string | null;

  // Global role from user_roles (ONLY set in DB)
  isGlobalAdmin: boolean;

  // Per-competition admin from competition_admins
  competitionAdminOf: string[]; // competition_id[]

  // Global scorer role (we keep as is)
  isScorer: boolean;

  // permissions per competition
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
  const { isGlobalAdmin, isCompetitionAdmin, user: currentUser } = useAuth();
  const isAdmin = isGlobalAdmin || isCompetitionAdmin;

  const { activeCompetitions, archivedCompetitions } = useCompetition();
  const { toast } = useToast();

  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [requests, setRequests] = useState<PermissionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);

  // competition selector state (top-level hook)
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>('');

  // unified competitions list
  const allCompetitions = useMemo(
    () => [...(activeCompetitions ?? []), ...(archivedCompetitions ?? [])],
    [activeCompetitions, archivedCompetitions]
  );

  // init selected competition when competitions change
  useEffect(() => {
    if (!selectedCompetitionId && allCompetitions.length > 0) {
      setSelectedCompetitionId(allCompetitions[0].id);
    }
  }, [allCompetitions, selectedCompetitionId]);

  // fetch users, roles and scorer permissions (including competition_id)
  const fetchUsers = async () => {
    try {
      // profiles
      const { data: profiles, error: profilesError } = await queryTable('profiles').select('user_id, email, display_name');
      if (profilesError) throw profilesError;

      // roles (global)
      const { data: roles, error: rolesError } = await queryTable('user_roles').select('user_id, role');
      if (rolesError) throw rolesError;

      // competition admins (per competition)
      const { data: compAdmins, error: compAdminsError } = await queryTable('competition_admins').select(
        'user_id, competition_id'
      );
      if (compAdminsError) throw compAdminsError;

      // scorer permissions (with competition_id)
      const { data: permissions, error: permissionsError } = await queryTable('scorer_permissions').select(
        'user_id, competition_id, section'
      );
      if (permissionsError) throw permissionsError;

      const usersWithRoles: UserWithRoles[] = (profiles ?? []).map((profile: any) => {
        const userRoles = roles?.filter((r: any) => r.user_id === profile.user_id) ?? [];
        const userPermissions = permissions?.filter((p: any) => p.user_id === profile.user_id) ?? [];
        const userCompAdmins = compAdmins?.filter((a: any) => a.user_id === profile.user_id) ?? [];

        return {
          userId: profile.user_id,
          email: profile.email,
          displayName: profile.display_name,

          // Global admin is ONLY from user_roles.role = 'admin'
          isGlobalAdmin: userRoles.some((r: any) => r.role === 'admin'),

          // Per competition admin
          competitionAdminOf: userCompAdmins.map((a: any) => a.competition_id as string),

          // scorer role can remain global
          isScorer: userRoles.some((r: any) => r.role === 'scorer'),

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

  // fetch pending permission requests and enrich with profile + competition name
  const fetchRequests = async (profiles: any[]) => {
    try {
      const { data, error } = await queryTable('permission_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const enrichedRequests: PermissionRequest[] = (data ?? []).map((req: any) => {
        const profile = profiles?.find((p: any) => p.user_id === req.user_id);
        const competition = allCompetitions.find((c) => c.id === req.competition_id);
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

  // fetch on mount / when admin toggles in
  useEffect(() => {
    if (isAdmin) {
      fetchAll();
    } else {
      // clear data if not admin
      setUsers([]);
      setRequests([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Approve request: add scorer role if needed, add scorer_permissions row (with competition_id), update request
  const handleApproveRequest = async (request: PermissionRequest) => {
    setProcessingRequest(request.id);
    try {
      // Add scorer role if not already present (do NOT care about admin here; global admin is separate)
      const u = users.find((x) => x.userId === request.user_id);
      if (u && !u.isScorer && !u.isGlobalAdmin) {
        const { error: rError } = await queryTable('user_roles').insert({ user_id: request.user_id, role: 'scorer' });
        if (rError) throw rError;
      }

      // Insert/upsert scorer_permissions for the specific competition + section
      const { error: pError } = await queryTable('scorer_permissions').upsert(
        {
          user_id: request.user_id,
          competition_id: request.competition_id,
          section: request.section,
        },
        { onConflict: 'user_id,competition_id,section' }
      );
      if (pError) throw pError;

      // Update request status
      const { error: uError } = await queryTable('permission_requests')
        .update({
          status: 'approved',
          reviewed_by: currentUser?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', request.id);
      if (uError) throw uError;

      toast({
        title: 'Ansökan godkänd',
        description: `Behörighet för ${SCOUT_SECTIONS[request.section].name} tilldelad.`,
      });
      await fetchAll();
    } catch (error) {
      console.error('Error approving request:', error);
      toast({
        title: 'Kunde inte godkänna ansökan',
        variant: 'destructive',
      });
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
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', request.id);
      if (error) throw error;

      toast({ title: 'Ansökan nekad' });
      await fetchAll();
    } catch (error) {
      console.error('Error denying request:', error);
      toast({
        title: 'Kunde inte neka ansökan',
        variant: 'destructive',
      });
    }
    setProcessingRequest(null);
  };

  /**
   * IMPORTANT:
   * - "Global admin" (user_roles.role='admin') must NEVER be toggled from UI.
   * - This checkbox is now "Tävlingsadmin" for the selected competition.
   */
  const toggleCompetitionAdmin = async (user: UserWithRoles) => {
    if (!selectedCompetitionId) {
      toast({ title: 'Välj tävling först', variant: 'destructive' });
      return;
    }

    setSaving(user.userId);
    try {
      const already = user.competitionAdminOf.includes(selectedCompetitionId);

      if (already) {
        const { error } = await queryTable('competition_admins')
          .delete()
          .eq('user_id', user.userId)
          .eq('competition_id', selectedCompetitionId);
        if (error) throw error;
      } else {
        const { error } = await queryTable('competition_admins').insert({
          user_id: user.userId,
          competition_id: selectedCompetitionId,
        });
        if (error) throw error;
      }

      await fetchAll();
      toast({ title: 'Tävlingsadmin uppdaterad' });
    } catch (error) {
      console.error('Error updating competition admin:', error);
      toast({
        title: 'Kunde inte uppdatera tävlingsadmin',
        variant: 'destructive',
      });
    }
    setSaving(null);
  };

  const toggleScorerRole = async (user: UserWithRoles) => {
    setSaving(user.userId);
    try {
      if (user.isScorer) {
        const { error } = await queryTable('user_roles').delete().eq('user_id', user.userId).eq('role', 'scorer');
        if (error) throw error;

        const { error: e2 } = await queryTable('scorer_permissions').delete().eq('user_id', user.userId);
        if (e2) throw e2;
      } else {
        const { error } = await queryTable('user_roles').insert({ user_id: user.userId, role: 'scorer' });
        if (error) throw error;
      }
      await fetchAll();
      toast({ title: 'Roll uppdaterad' });
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: 'Kunde inte uppdatera roll',
        variant: 'destructive',
      });
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
      const hasSection = user.permissions.some((p) => p.competition_id === selectedCompetitionId && p.section === section);

      if (hasSection) {
        const { error } = await queryTable('scorer_permissions')
          .delete()
          .eq('user_id', user.userId)
          .eq('competition_id', selectedCompetitionId)
          .eq('section', section);
        if (error) throw error;
      } else {
        const { error } = await queryTable('scorer_permissions').insert({
          user_id: user.userId,
          competition_id: selectedCompetitionId,
          section,
        });
        if (error) throw error;
      }
      await fetchAll();
      toast({ title: 'Behörighet uppdaterad' });
    } catch (error) {
      console.error('Error updating permission:', error);
      toast({
        title: 'Kunde inte uppdatera behörighet',
        variant: 'destructive',
      });
    }
    setSaving(null);
  };

  const deleteUser = async (user: UserWithRoles) => {
    setSaving(user.userId);
    try {
      const { error: p0 } = await queryTable('competition_admins').delete().eq('user_id', user.userId);
      if (p0) throw p0;

      const { error: p1 } = await queryTable('scorer_permissions').delete().eq('user_id', user.userId);
      if (p1) throw p1;

      const { error: p2 } = await queryTable('user_roles').delete().eq('user_id', user.userId);
      if (p2) throw p2;

      const { error: p3 } = await queryTable('permission_requests').delete().eq('user_id', user.userId);
      if (p3) throw p3;

      const { error: p4 } = await queryTable('profiles').delete().eq('user_id', user.userId);
      if (p4) throw p4;

      toast({ title: 'Användare borttagen', description: `${user.email} har tagits bort.` });
      await fetchAll();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Kunde inte ta bort användare',
        variant: 'destructive',
      });
    }
    setSaving(null);
  };

  // Section colors matching SectionBadge
  const sectionColors: Record<ScoutSection, string> = {
    sparare: 'bg-[hsl(200,70%,50%)] text-white hover:bg-[hsl(200,70%,45%)]',
    upptackare: 'bg-[hsl(150,60%,40%)] text-white hover:bg-[hsl(150,60%,35%)]',
    aventyrare: 'bg-[hsl(35,70%,50%)] text-white hover:bg-[hsl(35,70%,45%)]',
    utmanare: 'bg-[hsl(280,50%,45%)] text-white hover:bg-[hsl(280,50%,40%)]',
  };

  const sectionOutlineColors: Record<ScoutSection, string> = {
    sparare:
      'border-[hsl(200,70%,50%)] text-[hsl(200,70%,40%)] hover:bg-[hsl(200,70%,50%)] hover:text-white',
    upptackare:
      'border-[hsl(150,60%,40%)] text-[hsl(150,60%,35%)] hover:bg-[hsl(150,60%,40%)] hover:text-white',
    aventyrare:
      'border-[hsl(35,70%,50%)] text-[hsl(35,70%,45%)] hover:bg-[hsl(35,70%,50%)] hover:text-white',
    utmanare:
      'border-[hsl(280,50%,45%)] text-[hsl(280,50%,40%)] hover:bg-[hsl(280,50%,45%)] hover:text-white',
  };

  if (!isAdmin) {
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

      {/* Pending Permission Requests */}
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
              {requests.map((request) => (
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
                      {processingRequest === request.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Godkänn
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDenyRequest(request)}
                      disabled={processingRequest === request.id}
                    >
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
            Tilldela roller och behörigheter till användare. Scorers kan bara registrera poäng för sina tilldelade
            avdelningar.
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
                  {allCompetitions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <div className="ml-auto flex items-center gap-2">
                  <Badge variant="outline">Admin = Tävlingsadmin (vald tävling)</Badge>
                  {isGlobalAdmin && <Badge>Du är Global admin</Badge>}
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Användare</TableHead>
                    <TableHead>Global admin</TableHead>
                    <TableHead>Admin (tävling)</TableHead>
                    <TableHead>Scorer</TableHead>
                    <TableHead>Avdelningar</TableHead>
                    <TableHead className="w-16">Åtgärder</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {users.map((user) => {
                    const isCompAdminSelected = selectedCompetitionId
                      ? user.competitionAdminOf.includes(selectedCompetitionId)
                      : false;

                    return (
                      <TableRow key={user.userId}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{user.displayName || user.email}</p>
                            {user.displayName && <p className="text-sm text-muted-foreground">{user.email}</p>}
                          </div>
                        </TableCell>

                        {/* Global admin - read only */}
                        <TableCell>
                          <Checkbox checked={user.isGlobalAdmin} disabled />
                        </TableCell>

                        {/* Competition admin for selected competition */}
                        <TableCell>
                          <Checkbox
                            checked={isCompAdminSelected}
                            onCheckedChange={() => toggleCompetitionAdmin(user)}
                            disabled={saving === user.userId || !selectedCompetitionId}
                          />
                        </TableCell>

                        <TableCell>
                          <Checkbox
                            checked={user.isScorer}
                            onCheckedChange={() => toggleScorerRole(user)}
                            disabled={saving === user.userId || user.isGlobalAdmin}
                          />
                        </TableCell>

                        <TableCell>
                          {/* If global admin OR competition admin -> treat as "Alla avdelningar" in this competition */}
                          {user.isGlobalAdmin || isCompAdminSelected ? (
                            <Badge variant="secondary">Alla avdelningar</Badge>
                          ) : user.isScorer ? (
                            <div className="flex flex-wrap gap-2">
                              {(Object.keys(SCOUT_SECTIONS) as ScoutSection[]).map((section) => {
                                const enabled = user.permissions.some(
                                  (p) => p.competition_id === selectedCompetitionId && p.section === section
                                );

                                return (
                                  <Badge
                                    key={section}
                                    variant="outline"
                                    className={cn(
                                      'cursor-pointer border transition-colors',
                                      enabled ? sectionColors[section] : sectionOutlineColors[section]
                                    )}
                                    onClick={() => toggleSectionPermission(user, section)}
                                  >
                                    {SCOUT_SECTIONS[section].name}
                                    {saving === user.userId && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
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
                                disabled={saving === user.userId || user.userId === currentUser?.id}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Ta bort användare?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Detta kommer att ta bort användaren "{user.displayName || user.email}" och all
                                  tillhörande data. Denna åtgärd går inte att ångra.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Avbryt</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteUser(user)}
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
