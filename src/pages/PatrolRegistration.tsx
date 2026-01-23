import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { SCOUT_SECTIONS, ScoutSection } from '@/types/competition';
import { useCompetition } from '@/contexts/CompetitionContext';
import { Users, Trophy, CheckCircle2 } from 'lucide-react';

export default function PatrolRegistration() {
  const { competitions } = useCompetition();
  const { toast } = useToast();
  
  const [patrolName, setPatrolName] = useState('');
  const [scoutGroupId, setScoutGroupId] = useState('');
  const [section, setSection] = useState<ScoutSection | ''>('');
  const [memberCount, setMemberCount] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [competitionId, setCompetitionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Filter to only show active competitions
  const activeCompetitions = competitions.filter(c => c.status === 'active');

  // Auto-select if only one active competition
  useEffect(() => {
    if (activeCompetitions.length === 1 && !competitionId) {
      setCompetitionId(activeCompetitions[0].id);
    }
  }, [activeCompetitions, competitionId]);

  const selectedCompetition = activeCompetitions.find(c => c.id === competitionId);
  const availableScoutGroups = selectedCompetition?.scoutGroups ?? [];
  const selectedScoutGroup = availableScoutGroups.find(g => g.id === scoutGroupId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!patrolName.trim() || !scoutGroupId || !section || !competitionId || !contactEmail.trim()) {
      toast({
        title: 'Fyll i alla obligatoriska fält',
        description: 'Patrullnamn, kår, avdelning, kontakt-e-post och tävling är obligatoriska.',
        variant: 'destructive',
      });
      return;
    }

    const scoutGroupName = selectedScoutGroup?.name ?? '';

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('patrol_registrations' as any)
        .insert({
          competition_id: competitionId,
          patrol_name: patrolName.trim(),
          scout_group_name: scoutGroupName.trim(),
          section: section,
          member_count: memberCount ? parseInt(memberCount) : null,
          contact_email: contactEmail.trim() || null,
        } as any);

      if (error) throw error;

      setIsSubmitted(true);
      toast({
        title: 'Anmälan skickad!',
        description: 'Din patrull har anmälts till tävlingen.',
      });
    } catch (error: any) {
      console.error('Error submitting registration:', error);
      toast({
        title: 'Kunde inte skicka anmälan',
        description: error.message || 'Ett fel uppstod. Försök igen.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewRegistration = () => {
    setPatrolName('');
    setScoutGroupId('');
    setSection('');
    setMemberCount('');
    setContactEmail('');
    setIsSubmitted(false);
  };

  if (activeCompetitions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Ingen aktiv tävling</h3>
            <p className="text-muted-foreground text-center">
              Det finns ingen aktiv tävling att anmäla sig till just nu.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-16 w-16 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Anmälan mottagen!</h3>
            <p className="text-muted-foreground text-center mb-6">
              Patrullen <strong>{patrolName}</strong> från <strong>{selectedScoutGroup?.name}</strong> har anmälts till <strong>{selectedCompetition?.name}</strong>.
            </p>
            <Button onClick={handleNewRegistration} variant="outline">
              Anmäl ytterligare en patrull
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Users className="h-10 w-10 text-primary" />
          </div>
          <CardTitle>Anmäl patrull</CardTitle>
          <CardDescription>
            Fyll i formuläret för att anmäla en patrull till tävlingen
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {activeCompetitions.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="competition">Tävling *</Label>
                <Select value={competitionId} onValueChange={setCompetitionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Välj tävling" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCompetitions.map(comp => (
                      <SelectItem key={comp.id} value={comp.id}>
                        {comp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {activeCompetitions.length === 1 && (
              <div className="p-3 bg-muted rounded-lg flex items-center gap-2">
                <Trophy className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{activeCompetitions[0].name}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="patrolName">Patrullnamn *</Label>
              <Input
                id="patrolName"
                value={patrolName}
                onChange={(e) => setPatrolName(e.target.value)}
                placeholder="T.ex. Vargarna"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scoutGroup">Kår *</Label>
              {availableScoutGroups.length > 0 ? (
                <Select value={scoutGroupId} onValueChange={setScoutGroupId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Välj kår" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableScoutGroups.map(group => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                  Inga kårer har lagts till för denna tävling ännu.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="section">Avdelning *</Label>
              <Select value={section} onValueChange={(v) => setSection(v as ScoutSection)}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj avdelning" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(SCOUT_SECTIONS) as [ScoutSection, { name: string; ageRange: string }][]).map(
                    ([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {value.name} ({value.ageRange})
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="memberCount">Antal medlemmar</Label>
              <Input
                id="memberCount"
                type="number"
                min="1"
                max="20"
                value={memberCount}
                onChange={(e) => setMemberCount(e.target.value)}
                placeholder="Valfritt"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactEmail">Kontakt-e-post *</Label>
              <Input
                id="contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="T.ex. ledare@scout.se"
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Skickar...' : 'Skicka anmälan'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
