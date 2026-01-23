import { useState } from 'react';
import { useCompetition } from '@/contexts/CompetitionContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { ScoutSection, SCOUT_SECTIONS } from '@/types/competition';

interface StationFormProps {
  trigger?: React.ReactNode;
  station?: {
    id: string;
    name: string;
    description: string;
    maxScore: number;
    leaderEmail?: string;
    allowedSections?: ScoutSection[];
  };
  onSuccess?: () => void;
}

export function StationForm({ trigger, station, onSuccess }: StationFormProps) {
  const { addStation, updateStation } = useCompetition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(station?.name ?? '');
  const [description, setDescription] = useState(station?.description ?? '');
  const [maxScore, setMaxScore] = useState(station?.maxScore?.toString() ?? '10');
  const [leaderEmail, setLeaderEmail] = useState(station?.leaderEmail ?? '');
  const [allowedSections, setAllowedSections] = useState<ScoutSection[]>(station?.allowedSections ?? []);

  const toggleSection = (section: ScoutSection) => {
    setAllowedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      name: name.trim(),
      description: description.trim(),
      maxScore: parseInt(maxScore, 10) || 10,
      leaderEmail: leaderEmail.trim() || undefined,
      allowedSections: allowedSections.length > 0 ? allowedSections : undefined,
    };

    if (station) {
      updateStation(station.id, data);
    } else {
      addStation(data);
    }

    setOpen(false);
    setName('');
    setDescription('');
    setMaxScore('10');
    setLeaderEmail('');
    setAllowedSections([]);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Lägg till station
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {station ? 'Redigera station' : 'Ny station'}
            </DialogTitle>
            <DialogDescription>
              {station 
                ? 'Uppdatera stationens information.'
                : 'Lägg till en ny tävlingsstation.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Stationsnamn</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="T.ex. Eldkunskap"
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="description">Beskrivning</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Kort beskrivning av stationen..."
                rows={3}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="maxScore">Max poäng</Label>
              <Input
                id="maxScore"
                type="number"
                min={1}
                max={1000}
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                placeholder="10"
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="leaderEmail">Stationsansvarigs e-post (valfritt)</Label>
              <Input
                id="leaderEmail"
                type="email"
                value={leaderEmail}
                onChange={(e) => setLeaderEmail(e.target.value)}
                placeholder="ledare@scout.se"
              />
            </div>

            <div className="grid gap-2">
              <Label>Begränsa till avdelningar (valfritt)</Label>
              <p className="text-sm text-muted-foreground">
                Lämna tomt för att alla avdelningar ska kunna delta.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(Object.keys(SCOUT_SECTIONS) as ScoutSection[]).map(section => (
                  <div key={section} className="flex items-center space-x-2">
                    <Checkbox
                      id={`section-${section}`}
                      checked={allowedSections.includes(section)}
                      onCheckedChange={() => toggleSection(section)}
                    />
                    <label
                      htmlFor={`section-${section}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {SCOUT_SECTIONS[section].name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button type="submit">
              {station ? 'Spara' : 'Skapa station'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
