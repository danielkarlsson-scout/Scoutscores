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

// Helper to query tables that may not be in generated types yet
const queryTable = (tableName: string) => {
  return (supabase as any).from(tableName);
};

interface UserWithRoles {
  userId: string;
  email: string;
  displayName: string | null;

  // global role (read-only in UI)
  isGlobalAdmin: boolean;

  // scorer role (still stored in user_roles)
  isScorer: boolean;

  // permissions per competition
  permissions: { competition_id: string | null; section: ScoutSection }[];

  // competition admin memberships
  adminOfCompetitions: string[];
}

interface CompetitionAdminRow {
  competition_id: string;
  user_id: string;
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
  const { activeCompetitions, archivedCompetitions, competition: currentCompetition } = useCompetition();
  const { toast } = useToast();

  // Any admin can access admin page, but competition admin should be scoped to their competition
  const canViewAdmin = isGlobalAdmin || isCompetitionAdmin;

  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [requests, setRequests] = useState<PermissionRequest[]>([]);
  const [competitionAdmins, setCompetitionAdmins] = useState<CompetitionAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);

  // competition selector state
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>('');

  // unified competitions list
  const allCompetitions = useMemo(
    () => [...(activeCompetitions ?? []), ...(archivedCompetitions ?? [])],
    [activeCompetitions, archivedCompetitions]
  );

  // Prefer current selected competition from context if available
  useEffect(() => {
    if (!selectedCompetitionId) {
      if (currentCompetition?.id) {
        setSelectedCompetitionId(currentCompetition.id);
      } else if (allCompetitions.length > 0) {
        setSelectedCompetitionId(allCompetitions[0].id);
      }
    }
  }, [allCompetitions, currentCompetition?.id, selectedCompetitionId]);

  const selectedCompetition = useMemo(
    () => allCompetitions.find((c) => c.id === selectedCompetitionId),
    [allCompetitions, selectedCompetitionId]
  );

  const currentUserIsAdminForSelectedCompetition = useMemo(() => {
    if (isGlobalAdmin) return true;
    // isCompetitionAdmin usually means "admin for currently selected competition in app context".
    // But here we allow by DB membership too, since user can pick competition in dropdown.
    // We'll check membership using competition_admins we fetched.
    if (!currentUser?.id || !selectedCompetitionId) return false;
    return competitionAdmins.some(
      (row) => row.competition_id === selectedCompetitionId && row.user_id === currentUser.id
    );
  }, [competitionAdmins, currentUser?.id, isGlobalAdmin, selectedCompetitionId]);

  // Fetch users, roles, scorer permissions, and competition admins
  const fetchUsers = async () => {
    try {
      // profiles
      const { data: profiles, error: profilesError } = await queryTable('profiles')
        .select('user_id, email, display_name');

      if (profilesError) throw profilesError;

      // roles (global admin + scorer role live here)
      const { data: roles, error: rolesError } = await queryTable('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // scorer permissions (with competition_id)
      const { data: permissions, error: permissionsError } = await queryTable('scorer_permissions')
        .select('user_id, competition_id, section');

      if (permissionsError) throw permissionsError;

      // competition admins (competition_id + user_id)
      const { data: compAdmins, error: compAdminsError } = await queryTable('competition_admins')
        .select('competition_id, user_id');

      if (compAdminsError) throw compAdminsError;

      setCompetitionAdmins((compAdmins ?? []) as CompetitionAdminRow[]);

      const usersWithRoles: UserWithRoles[] = (profiles ?? []).map((profile: any) => {
        const userRoles = roles?.filter((r: any) => r.user_id === profile.user_id) ?? [];
        const userPermissions = permissions?.filter((p: any) => p.user_id === profile.user_id) ?? [];
        const userCompAdmins = (compAdmins ?? []).filter((a: any) => a.user_id === profile.user_id);

        return {
          userId: profile.user_id,
          email: profile.email,
          displayName: profile.display_name,
          isGlobalAdmin: userRoles.some((r: any) => r.role === 'admin'),
          isScorer: userRoles.some((r: any) => r.role === 'scorer'),
          permissions: userPermissions.map((p: any) => ({
            competition_id: p.competition_id ?? null,
            section: p.section as ScoutSection,
          })),
          adminOfCompetitions: userCompAdmins.map((a: any) => a.competition_id),
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
    if (canViewAdmin) {
      fetchAll();
    } else {
      setUsers([]);
      setRequests([]);
      setCompetitionAdmins([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewAdmin]);

  // Approve request: add scorer role if needed, add scorer_permissions row (with competition_id), update request
  const handleApproveRequest = async (request: PermissionRequest) => {
    // Competition admins should only approve requests for their competition
    if (!isGlobalAdmin) {
      if (!request.competition_id || request.competition_id !== selectedCompetitionId) {
        toast({ title: 'Fel tävling vald', variant: 'destructive' });
        return;
      }
      if (!currentUserIsAdminForSelectedCompetition) {
        toast({ title: 'Saknar behörighet', variant: 'destructive' });
        return;
      }
    }

    setProcessingRequest(request.id);
    try {
      // Add scorer role if not already present
      const u = users.find(u => u.userId === request.user_id);
      if (u && !u.isScorer && !u.isGlobalAdmin) {
        const { error: rError } = await queryTable('user_roles')
          .insert({ user_id: request.user_id, role: 'scorer' });
        if (rError) throw rError;
      }

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
    if (!isGlobalAdmin) {
      if (!request.competition_id || request.competition_id !== selectedCompetitionId) {
        toast({ title: 'Fel tävling vald', variant: 'destructive' });
        return;
      }
      if (!currentUserIsAdminForSelectedCompetition) {
        toast({ title: 'Saknar behörighet', variant: 'destructive' });
        return;
      }
    }

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

  /**
   * Admin checkbox = competition admin for selected competition.
   * IMPORTANT: Global admin is read-only and MUST NOT be toggled from UI.
   */
  const toggleCompetitionAdmin = async (user: UserWithRoles) => {
    if (!selectedCompetitionId) {
      toast({ title: 'Välj tävling först', variant: 'destructive' });
      return;
    }

    // If you are only competition admin, you may only manage admins for your competition
    if (!isGlobalAdmin && !currentUserIsAdminForSelectedCompetition) {
      toast({ title: 'Saknar behörighet för vald tävling', variant: 'destructive' });
      return;
    }

    // Don't allow editing global admin status from UI (and don't allow removing global admin's effective power)
    if (user.isGlobalAdmin) {
      toast({
        title: 'Global admin',
        description: 'Global admin kan bara tilldelas/ändras i databasen.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(user.userId);
    try {
      const isAdminForThisCompetition = competitionAdmins.some(
        (row) => row.competition_id === selectedCompetitionId && row.user_id === user.userId
      );

      if (isAdminForThisCompetition) {
        const { error } = await queryTable('competition_admins')
          .delete()
          .eq('competition_id', selectedCompetitionId)
          .eq('user_id', user.userId);
        if (error) throw error;
      } else {
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
    // competition admin should be able to set scorer for their competition (and global admin for all)
    if (!isGlobalAdmin && !currentUserIsAdminForSelectedCompetition) {
      toast({ title: 'Saknar behörighet för vald tävling', variant: 'destructive' });
      return;
    }

    setSaving(user.userId);
    try {
      if (user.isScorer) {
        const { error } = await queryTable('user_roles')
          .delete()
          .eq('user_id', user.userId)
          .eq('role', 'scorer');
        if (error) throw error;

        // remove all scorer permissions (global) OR optionally restrict to selectedCompetitionId
        // We keep existing behavior: remove ALL (since scorer role implies permissions)
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
      console.error('Error updating role:', error);
      toast({ title: 'Kunde inte uppdatera roll', variant: 'destructive' });
    }
    setSaving(null);
  };

  const toggleSectionPermission = async (user: UserWithRoles, section: ScoutSection) => {
    if (!selectedCompetitionId) {
      toast({ title: 'Välj tävling först', variant: 'destructive' });
      return;
    }

    if (!isGlobalAdmin && !currentUserIsAdminForSelectedCompetition) {
      toast({ title: 'Saknar behörighet för vald tävling', variant: 'destructive' });
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
    // Usually only global admin should delete users (optional).
    // If you want competition admins to delete users, remove this check.
    if (!isGlobalAdmin) {
      toast({
        title: 'Endast global admin',
        description: 'Att ta bort användare är endast tillåtet för global admin.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(user.userId);
    try {
      const { error: p0 } = await queryTable('competition_admins')
        .delete()
        .eq('user_id', user.userId);
      if (p0) throw p0;

      const { error: p1 } = await queryTable('scorer_permissions')
        .delete()
        .eq('user_id', user.userId);
      if (p1) throw p1;

      const { error: p2 } = await queryTable('user_roles')
        .delete()
        .eq('user_id', user.userId);
      if (p2) throw p2;

      const { error: p3 } = await queryTable('permission_requests')
        .delete()
        .eq('user_id', user.userId);
      if (p3) throw p3;

      const { error: p4 } = await queryTable('profiles')
        .delete()
        .eq('user_id', user.userId);
      if (p4) throw p4;

      toast({ title: 'Användare borttagen', description: `${user.email} har tagits bort.` });
      await fetchAll();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({ title: 'Kunde inte ta bort användare', variant: 'destructive' });
    }
    setSaving(null);
  };

  // Section colors matching SectionBadge
  const sectionColors: Record<ScoutSection, string> = {
    sparare: 'bg-[hsl(200,70%,50%)] text-white hover:bg-[hsl(200,70%,45%)]',
    upptackare: 'bg-[hsl(150,60%,40%)] text-white hover:bg-[hsl(150,60%,35%)]',
    aventyrare: 'bg-[hsl(35,70%,50%)] text-white hover:bg-[hsl(35,70%,45%)]',
    utmanare: 'bg-[hsl(280,50%,45%)] text-white hover:bg-[hsl(280,50%,40%)]',
    // rover? (if you added it in enum/types, add colors here too)
    // rover: 'bg-[hsl(...)] text-white hover:bg-[hsl(...)]',
  } as any;

  const sectionOutlineColors: Record<ScoutSection, string> = {
    sparare: 'border-[hsl(200,70%,50%)] text-[hsl(200,70%,40%)] hover:bg-[hsl(200,70%,50%)] hover:text-white',
    upptackare: 'border-[hsl(150,60%,40%)] text-[hsl(150,60%,35%)] hover:bg-[hsl(150,60%,40%)] hover:text-white',
    aventyrare: 'border-[hsl(35,70%,50%)] text-[hsl(35,70%,45%)] hover:bg-[hsl(35,70%,50%)] hover:text-white',
    utmanare: 'border-[hsl(280,50%,45%)] text-[hsl(280,50%,40%)] hover:bg-[hsl(280,50%,45%)] hover:text-white',
    // rover: 'border-[hsl(...)] text-[hsl(...)] hover:bg-[hsl(...)] hover:text-white',
  } as any;

  if (!canViewAdmin) {
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
                <div
                  key={request.id}
                  className="flex items-center justify-between rounded-lg border p-4 bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-medium">{request.userDisplayName || request.userEmail}</p>
                      {request.userDisplayName && (
                        <p className="text-sm text-muted-foreground">{request.userEmail}</p>
                      )}
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
                    <Button
                      size="sm"
                      onClick={() => handleApproveRequest(request)}
                      disabled={processingRequest === request.id}
                    >
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
            <span className="block">
              “Admin” här betyder <strong>Tävlingsadmin</strong> för vald tävling.
              <span className="ml-1">Global admin kan bara sättas i databasen.</span>
            </span>
            <span className="block mt-1">
              Scorers kan bara registrera poäng för sina tilldelade avdelningar (per tävling).
            </span>
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                <div className="flex items-center gap-3">
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
                </div>

                {!isGlobalAdmin && (
                  <Badge variant="secondary">
                    Du administrerar: {selectedCompetition?.name ?? '—'}
                  </Badge>
                )}
              </div>

              {/* If competition admin but not admin of chosen competition -> warn */}
              {!isGlobalAdmin && selectedCompetitionId && !currentUserIsAdminForSelectedCompetition && (
                <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  Du är inte tävlingsadmin för vald tävling. Välj en tävling du administrerar eller be en admin lägga till dig.
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Användare</TableHead>
                    <TableHead>Admin (tävling)</TableHead>
                    <TableHead>Scorer</TableHead>
                    <TableHead>Avdelningar</TableHead>
                    <TableHead className="w-16">Åtgärder</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {users.map((u) => {
                    const isCompetitionAdminForSelected = !!selectedCompetitionId
                      ? u.adminOfCompetitions.includes(selectedCompetitionId)
                      : false;

                    const canEditThisRow =
                      isGlobalAdmin || currentUserIsAdminForSelectedCompetition;

                    return (
                      <TableRow key={u.userId}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{u.displayName || u.email}</p>
                              {u.isGlobalAdmin && (
                                <Badge variant="secondary">Global admin</Badge>
                              )}
                            </div>
                            {u.displayName && (
                              <p className="text-sm text-muted-foreground">{u.email}</p>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Checkbox
                            checked={u.isGlobalAdmin ? true : isCompetitionAdminForSelected}
                            onCheckedChange={() => toggleCompetitionAdmin(u)}
                            disabled={
                              saving === u.userId ||
                              !selectedCompetitionId ||
                              !canEditThisRow ||
                              u.isGlobalAdmin
                            }
                          />
                        </TableCell>

                        <TableCell>
                          <Checkbox
                            checked={u.isScorer}
                            onCheckedChange={() => toggleScorerRole(u)}
                            disabled={
                              saving === u.userId ||
                              !selectedCompetitionId ||
                              !canEditThisRow ||
                              u.isGlobalAdmin // optional: global admin doesn't need scorer role
                            }
                          />
                        </TableCell>

                        <TableCell>
                          {u.isGlobalAdmin || isCompetitionAdminForSelected ? (
                            <Badge variant="secondary">Alla avdelningar</Badge>
                          ) : u.isScorer ? (
                            <div className="flex flex-wrap gap-2">
                              {(Object.keys(SCOUT_SECTIONS) as ScoutSection[]).map((section) => {
                                const enabled = u.permissions.some(
                                  (p) => p.competition_id === selectedCompetitionId && p.section === section
                                );
                                return (
                                  <Badge
                                    key={section}
                                    variant="outline"
                                    className={cn(
                                      'cursor-pointer border transition-colors',
                                      enabled ? sectionColors[section] : sectionOutlineColors[section],
                                      !canEditThisRow && 'opacity-60 pointer-events-none'
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
                                disabled={
                                  saving === u.userId ||
                                  u.userId === currentUser?.id ||
                                  !isGlobalAdmin
                                }
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Ta bort användare?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Detta kommer att ta bort användaren "{u.displayName || u.email}" och all
                                  tillhörande data. Denna åtgärd går inte att ångra.
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
