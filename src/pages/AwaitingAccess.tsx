import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, LogOut, Trophy, TreePine, Send, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompetition } from '@/contexts/CompetitionContext';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SCOUT_SECTIONS, ScoutSection } from '@/types/competition';
import { SectionBadge } from '@/components/ui/section-badge';

interface PermissionRequest {
  id: string;
  section: ScoutSection;
  competition_id: string;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
}

// Om true: visa inte requests som hör till stängda tävlingar (tar bort "Okänd tävling"-känslan helt)
const HIDE_CLOSED = true;

type CompetitionInfo = {
  id: string;
  name: string;
  date: string;
  is_active: boolean;
};

export default function AwaitingAccess() {
  const { user, signOut, refreshRoles } = useAuth();
  const { activeCompetitions } = useCompetition();
  const { toast } = useToast();

  const [selectedCompetition, setSelectedCompetition] = useState<string>('');
  const [selectedSections, setSelectedSections] = useState<ScoutSection[]>([]);
  const [existingRequests, setExistingRequests] = useState<PermissionRequest[]>([]);
  const [competitionMap, setCompetitionMap] = useState<Record<string, CompetitionInfo>>({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const fetchExistingRequests = async () => {
    if (!user) return;

    setFetching(true);

    const { data, error } = await (supabase as any)
      .from('permission_requests')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      console.error(error);
      setExistingRequests([]);
      setFetching(false);
      return;
    }

    const requests: PermissionRequest[] = data ?? [];
    setExistingRequests(requests);

    // 🔥 Hämta competition-info för alla competition_id som förekommer i requests
    const uniqueCompetitionIds = Array.from(new Set(requests.map(r => r.competition_id).filter(Boolean)));

    if (uniqueCompetitionIds.length > 0) {
      const { data: comps, error: compsErr } = await (supabase as any)
        .from('competitions')
        .select('id,name,date,is_active')
        .in('id', uniqueCompetitionIds);

      if (compsErr) {
        console.error(compsErr);
      } else {
        const map: Record<string, CompetitionInfo> = {};
        for (const c of comps ?? []) {
          map[c.id] = c;
        }
        setCompetitionMap(map);
      }
    } else {
      setCompetitionMap({});
    }

    setFetching(false);
  };

  useEffect(() => {
    fetchExistingRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Set default competition if only one exists
  useEffect(() => {
    if (activeCompetitions.length === 1 && !selectedCompetition) {
      setSelectedCompetition(activeCompetitions[0].id);
    }
  }, [activeCompetitions, selectedCompetition]);

  // Check for approved requests and refresh roles
  useEffect(() => {
    const approvedRequests = existingRequests.filter(r => r.status === 'approved');
    if (approvedRequests.length > 0) {
      refreshRoles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingRequests]);

  const handleSectionToggle = (section: ScoutSection) => {
    setSelectedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const handleSubmitRequest = async () => {
    if (!selectedCompetition) {
      toast({
        title: 'Välj en tävling',
        description: 'Du måste välja vilken tävling du vill poängsätta för.',
        variant: 'destructive',
      });
      return;
    }

    if (selectedSections.length === 0) {
      toast({
        title: 'Välj minst en avdelning',
        description: 'Du måste välja vilka avdelningar du vill poängsätta.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    // Filter out sections that already have pending or approved requests for this competition
    const existingPendingOrApproved = existingRequests
      .filter(r => r.competition_id === selectedCompetition && (r.status === 'pending' || r.status === 'approved'))
      .map(r => r.section);

    const newSections = selectedSections.filter(s => !existingPendingOrApproved.includes(s));

    if (newSections.length === 0) {
      toast({
        title: 'Ansökningar finns redan',
        description: 'Du har redan ansökt om eller fått behörighet för dessa avdelningar i denna tävling.',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    const requests = newSections.map(section => ({
      user_id: user?.id,
      section,
      competition_id: selectedCompetition,
      status: 'pending',
    }));

    const { error } = await (supabase as any)
      .from('permission_requests')
      .insert(requests);

    if (error) {
      toast({
        title: 'Kunde inte skicka ansökan',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Ansökan skickad!',
        description: 'En administratör kommer att granska din ansökan.',
      });
      setSelectedSections([]);
      await fetchExistingRequests();
    }

    setLoading(false);
  };

  const handleCancelRequest = async (requestId: string) => {
    const { error } = await (supabase as any)
      .from('permission_requests')
      .delete()
      .eq('id', requestId);

    if (error) {
      toast({
        title: 'Kunde inte ta bort ansökan',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Ansökan borttagen',
      });
      await fetchExistingRequests();
    }
  };

  const getCompetitionName = (competitionId: string) => {
    // 1) från competitionMap (inkl stängda)
    const fromMap = competitionMap[competitionId];
    if (fromMap?.name) return fromMap.name;

    // 2) fallback till aktiva (din gamla logik)
    const comp = activeCompetitions.find(c => c.id === competitionId);
    return comp?.name || 'Okänd tävling';
  };

  const isCompetitionActive = (competitionId: string) => {
    const c = competitionMap[competitionId];
    if (typeof c?.is_active === 'boolean') return c.is_active;
    // fallback: om den finns bland activeCompetitions så är den aktiv
    return !!activeCompetitions.find(ac => ac.id === competitionId);
  };

  const pendingRequestsAll = existingRequests.filter(r => r.status === 'pending');
  const approvedRequestsAll = existingRequests.filter(r => r.status === 'approved');
  const deniedRequestsAll = existingRequests.filter(r => r.status === 'denied');

  const pendingRequests = useMemo(
    () => (HIDE_CLOSED ? pendingRequestsAll.filter(r => isCompetitionActive(r.competition_id)) : pendingRequestsAll),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingRequestsAll, competitionMap, activeCompetitions]
  );

  const approvedRequests = useMemo(
    () => (HIDE_CLOSED ? approvedRequestsAll.filter(r => isCompetitionActive(r.competition_id)) : approvedRequestsAll),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [approvedRequestsAll, competitionMap, activeCompetitions]
  );

  const deniedRequests = useMemo(
    () => (HIDE_CLOSED ? deniedRequestsAll.filter(r => isCompetitionActive(r.competition_id)) : deniedRequestsAll),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deniedRequestsAll, competitionMap, activeCompetitions]
  );

  // ✅ Gruppera godkända per tävling -> sektioner
  const approvedByCompetition = useMemo(() => {
    const map: Record<string, { competitionId: string; name: string; sections: ScoutSection[] }> = {};

    for (const r of approvedRequests) {
      if (!map[r.competition_id]) {
        map[r.competition_id] = {
          competitionId: r.competition_id,
          name: getCompetitionName(r.competition_id),
          sections: [],
        };
      }
      if (!map[r.competition_id].sections.includes(r.section)) {
        map[r.competition_id].sections.push(r.section);
      }
    }

    // Sortera tävlingar alfabetiskt (valfritt)
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'sv-SE'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedRequests, competitionMap]);

  // Get sections that can still be requested for the selected competition
  const getAvailableSections = () => {
    if (!selectedCompetition) return Object.keys(SCOUT_SECTIONS) as ScoutSection[];

    return (Object.keys(SCOUT_SECTIONS) as ScoutSection[]).filter(section => {
      const existing = existingRequests.find(
        r =>
          r.section === section &&
          r.competition_id === selectedCompetition &&
          (r.status === 'pending' || r.status === 'approved')
      );
      return !existing;
    });
  };

  const availableSections = getAvailableSections();

  return (
    <div className="min-h-screen bg-background">
      {/* Simple Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <TreePine className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold text-primary">ScoutScore</span>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Logga ut
          </Button>
        </div>
      </header>

      <main className="container px-4 py-12">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
              <CardTitle className="text-2xl">Väntar på behörighet</CardTitle>
              <CardDescription className="text-base">
                Ditt konto är aktivt. Ansök om poängsättarbehörighet nedan
                eller vänta på att en administratör tilldelar dig behörigheter.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted p-4 text-center">
                <p className="text-sm text-muted-foreground">Inloggad som</p>
                <p className="font-medium">{user?.email}</p>
              </div>
            </CardContent>
          </Card>

          {/* Request Permission */}
          {!fetching && activeCompetitions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Send className="h-5 w-5 text-primary" />
                  Ansök om poängsättarbehörighet
                </CardTitle>
                <CardDescription>
                  Välj tävling och vilka avdelningar du vill kunna poängsätta
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Competition Selection */}
                <div className="space-y-2">
                  <Label>Tävling</Label>
                  <Select value={selectedCompetition} onValueChange={setSelectedCompetition}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Välj tävling..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      {activeCompetitions.map(comp => (
                        <SelectItem key={comp.id} value={comp.id}>
                          <div className="flex items-center gap-2">
                            <Trophy className="h-4 w-4 text-primary" />
                            <span>{comp.name}</span>
                            <span className="text-muted-foreground text-xs">
                              ({new Date(comp.date).toLocaleDateString('sv-SE')})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Section Selection */}
                {selectedCompetition && (
                  <>
                    <div className="space-y-2">
                      <Label>Avdelningar</Label>
                      {availableSections.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3">
                          {availableSections.map(section => (
                            <div key={section} className="flex items-center space-x-3">
                              <Checkbox
                                id={`section-${section}`}
                                checked={selectedSections.includes(section)}
                                onCheckedChange={() => handleSectionToggle(section)}
                                disabled={loading}
                              />
                              <Label
                                htmlFor={`section-${section}`}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <SectionBadge section={section} size="sm" />
                              </Label>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Du har redan ansökt om alla avdelningar för denna tävling.
                        </p>
                      )}
                    </div>

                    {availableSections.length > 0 && (
                      <Button
                        onClick={handleSubmitRequest}
                        disabled={loading || selectedSections.length === 0}
                        className="w-full"
                      >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Skicka ansökan
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* No active competitions */}
          {!fetching && activeCompetitions.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Inga aktiva tävlingar</h3>
                <p className="text-muted-foreground text-center">
                  Det finns inga aktiva tävlingar att ansöka behörighet för just nu.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Pending Requests */}
          {pendingRequests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5 text-amber-500" />
                  Väntande ansökningar
                </CardTitle>
                {HIDE_CLOSED && (
                  <CardDescription>
                    Visar endast ansökningar för aktiva tävlingar
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pendingRequests.map(request => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <SectionBadge section={request.section} />
                          <Badge variant="outline">Väntar</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {getCompetitionName(request.competition_id)}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelRequest(request.id)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Approved Requests (per competition) */}
          {approvedRequests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Godkända behörigheter
                </CardTitle>
                <CardDescription>
                  Ladda om sidan för att komma åt poängsättningen
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {approvedByCompetition.map((c) => (
                  <div
                    key={c.competitionId}
                    className="rounded-lg border p-3 bg-primary/5"
                  >
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {c.sections.map((s) => (
                        <SectionBadge key={s} section={s} size="sm" />
                      ))}
                    </div>
                  </div>
                ))}

                <Button
                  onClick={() => window.location.reload()}
                  className="w-full mt-4"
                >
                  Uppdatera sidan
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Denied Requests */}
          {deniedRequests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-destructive">
                  <XCircle className="h-5 w-5" />
                  Nekade ansökningar
                </CardTitle>
                <CardDescription>
                  Du kan skicka en ny ansökan om du vill
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {deniedRequests.map(request => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between rounded-lg border p-3 bg-destructive/5"
                    >
                      <div className="flex flex-col gap-1">
                        <SectionBadge section={request.section} />
                        <span className="text-xs text-muted-foreground">
                          {getCompetitionName(request.competition_id)}
                        </span>
                      </div>
                      <XCircle className="h-5 w-5 text-destructive" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
