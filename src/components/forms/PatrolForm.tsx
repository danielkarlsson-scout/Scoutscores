import { useState } from 'react';
import { useCompetition } from '@/contexts/CompetitionContext';
import { ScoutSection, SCOUT_SECTIONS } from '@/types/competition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';

interface PatrolFormProps {
  trigger?: React.ReactNode;
  patrol?: {
    id: string;
    name: string;
    section: ScoutSection;
    scoutGroupId?: string;
    members?: number;
  };
  onSuccess?: () => void;
}

export function PatrolForm({ trigger, patrol, onSuccess }: PatrolFormProps) {
  const { addPatrol, updatePatrol, scoutGroups } = useCompetition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(patrol?.name ?? '');
  const [section, setSection] = useState<ScoutSection>(patrol?.section ?? 'aventyrare');
  const [scoutGroupId, setScoutGroupId] = useState<string>(patrol?.scoutGroupId ?? '');
  const [members, setMembers] = useState(patrol?.members?.toString() ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      name: name.trim(),
      section,
      scoutGroupId: scoutGroupId || undefined,
      members: members ? parseInt(members, 10) : undefined,
    };

    if (patrol) {
      updatePatrol(patrol.id, data);
    } else {
      addPatrol(data);
    }

    setOpen(false);
    setName('');
    setSection('aventyrare');
    setScoutGroupId('');
    setMembers('');
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Lägg till patrull
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {patrol ? 'Redigera patrull' : 'Ny patrull'}
            </DialogTitle>
            <DialogDescription>
              {patrol 
                ? 'Uppdatera patrullens information.'
                : 'Lägg till en ny patrull till tävlingen.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Patrullnamn</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="T.ex. Vargpatrullen"
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="section">Avdelning</Label>
              <Select value={section} onValueChange={(v) => setSection(v as ScoutSection)}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj avdelning" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(SCOUT_SECTIONS) as [ScoutSection, { name: string; ageRange: string }][]).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {value.name} ({value.ageRange})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="scoutGroup">Kår (valfritt)</Label>
              <Select 
                value={scoutGroupId || '__none__'} 
                onValueChange={(v) => setScoutGroupId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Välj kår" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ingen kår</SelectItem>
                  {scoutGroups.map(group => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="members">Antal medlemmar (valfritt)</Label>
              <Input
                id="members"
                type="number"
                min={1}
                max={20}
                value={members}
                onChange={(e) => setMembers(e.target.value)}
                placeholder="6"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button type="submit">
              {patrol ? 'Spara' : 'Skapa patrull'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

