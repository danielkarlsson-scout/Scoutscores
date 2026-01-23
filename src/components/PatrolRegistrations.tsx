import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompetition } from '@/contexts/CompetitionContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SectionBadge } from '@/components/ui/section-badge';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, Check, X, Building2, Users, RefreshCw } from 'lucide-react';
import { ScoutSection } from '@/types/competition';

interface PatrolRegistration {
  id: string;
  competition_id: string;
  patrol_name: string;
  scout_group_name: string;
  section: ScoutSection;
  member_count: number | null;
  contact_email: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export function PatrolRegistrations() {
  const { competition, addPatrol, scoutGroups } = useCompetition();
  const { toast } = useToast();
  const [registrations, setRegistrations] = useState<PatrolRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchRegistrations = async () => {
    if (!competition) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('patrol_registrations')
        .select('*')
        .eq('competition_id', competition.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRegistrations((data as PatrolRegistration[]) || []);
    } catch (error: any) {
      console.error('Error fetching registrations:', error);
      toast({
        title: 'Kunde inte hämta anmälningar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
  }, [competition?.id]);

  const handleApprove = async (registration: PatrolRegistration) => {
    setProcessingId(registration.id);
    
    try {
      // Find matching scout group by name
      const matchingGroup = scoutGroups.find(
        g => g.name.toLowerCase() === registration.scout_group_name.toLowerCase()
      );

      // Add patrol to competition
      addPatrol({
        name: registration.patrol_name,
        section: registration.section,
        members: registration.member_count || undefined,
        scoutGroupId: matchingGroup?.id,
      });

      // Update registration status in database
      const { error } = await supabase
        .from('patrol_registrations')
        .update({ 
          status: 'approved',
          reviewed_at: new Date().toISOString()
        } as any)
        .eq('id', registration.id);

      if (error) throw error;

      // Update local state
      setRegistrations(prev => 
        prev.map(r => r.id === registration.id ? { ...r, status: 'approved' as const } : r)
      );

      toast({
        title: 'Anmälan godkänd',
        description: `Patrullen "${registration.patrol_name}" har lagts till i tävlingen.`,
      });
    } catch (error: any) {
      console.error('Error approving registration:', error);
      toast({
        title: 'Kunde inte godkänna anmälan',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (registration: PatrolRegistration) => {
    setProcessingId(registration.id);
    
    try {
      const { error } = await supabase
        .from('patrol_registrations')
        .update({ 
          status: 'rejected',
          reviewed_at: new Date().toISOString()
        } as any)
        .eq('id', registration.id);

      if (error) throw error;

      setRegistrations(prev => 
        prev.map(r => r.id === registration.id ? { ...r, status: 'rejected' as const } : r)
      );

      toast({
        title: 'Anmälan avvisad',
        description: `Anmälan för "${registration.patrol_name}" har avvisats.`,
      });
    } catch (error: any) {
      console.error('Error rejecting registration:', error);
      toast({
        title: 'Kunde inte avvisa anmälan',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const pendingRegistrations = registrations.filter(r => r.status === 'pending');
  const processedRegistrations = registrations.filter(r => r.status !== 'pending');

  if (!competition) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            <CardTitle>Inkomna anmälningar</CardTitle>
            {pendingRegistrations.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingRegistrations.length} väntande
              </Badge>
            )}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchRegistrations}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Uppdatera
          </Button>
        </div>
        <CardDescription>
          Granska och godkänn patrullanmälningar från den publika anmälningssidan
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Laddar anmälningar...
          </div>
        ) : pendingRegistrations.length === 0 && processedRegistrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <ClipboardList className="h-10 w-10 mb-2" />
            <p>Inga anmälningar har inkommit ännu</p>
          </div>
        ) : (
          <div className="space-y-6">
            {pendingRegistrations.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3 text-muted-foreground">Väntande anmälningar</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patrull</TableHead>
                      <TableHead>Avdelning</TableHead>
                      <TableHead className="hidden md:table-cell">Kår</TableHead>
                      <TableHead className="hidden sm:table-cell">Medlemmar</TableHead>
                      <TableHead className="w-32">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRegistrations.map(registration => (
                      <TableRow key={registration.id}>
                        <TableCell className="font-medium">
                          {registration.patrol_name}
                          {registration.contact_email && (
                            <span className="block text-xs text-muted-foreground">
                              {registration.contact_email}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <SectionBadge section={registration.section} size="sm" />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            {registration.scout_group_name}
                          </span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {registration.member_count ? (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Users className="h-3 w-3" />
                              {registration.member_count}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                              onClick={() => handleApprove(registration)}
                              disabled={processingId === registration.id}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleReject(registration)}
                              disabled={processingId === registration.id}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {processedRegistrations.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3 text-muted-foreground">Behandlade anmälningar</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patrull</TableHead>
                      <TableHead>Avdelning</TableHead>
                      <TableHead className="hidden md:table-cell">Kår</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processedRegistrations.map(registration => (
                      <TableRow key={registration.id} className="opacity-60">
                        <TableCell className="font-medium">{registration.patrol_name}</TableCell>
                        <TableCell>
                          <SectionBadge section={registration.section} size="sm" />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {registration.scout_group_name}
                        </TableCell>
                        <TableCell>
                          {registration.status === 'approved' ? (
                            <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5">
                              Godkänd
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-destructive border-destructive/20 bg-destructive/5">
                              Avvisad
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
