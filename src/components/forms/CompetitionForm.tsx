import { useState } from 'react';
import { useCompetition } from '@/contexts/CompetitionContext';
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
import { Plus } from 'lucide-react';

interface CompetitionFormProps {
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function CompetitionForm({ trigger, onSuccess }: CompetitionFormProps) {
  const { createCompetition } = useCompetition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) return;
    
    createCompetition({
      name: name.trim(),
      date,
    });

    setOpen(false);
    setName('');
    setDate(new Date().toISOString().split('T')[0]);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Ny tävling
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Skapa ny tävling</DialogTitle>
            <DialogDescription>
              Skapa en ny scouttävling för att börja registrera stationer, patruller och poäng.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Tävlingsnamn</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="T.ex. Vårscoutkampen 2025"
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="date">Datum</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button type="submit">
              Skapa tävling
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
