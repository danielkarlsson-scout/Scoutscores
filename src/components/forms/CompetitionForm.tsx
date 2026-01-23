import { useState } from "react";
import { useCompetition } from "@/contexts/CompetitionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

interface CompetitionFormProps {
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function CompetitionForm({ trigger, onSuccess }: CompetitionFormProps) {
  const { createCompetition } = useCompetition();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const resetForm = () => {
    setName("");
    setDate(new Date().toISOString().split("T")[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    try {
      await createCompetition({
        name: name.trim(),
        date,
      });

      setOpen(false);
      resetForm();
      onSuccess?.();
    } catch (err) {
      console.error("Failed to create competition:", err);
      // valfritt: visa toast här om ni vill
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button disabled={submitting}>
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
                disabled={submitting}
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
                disabled={submitting}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Avbryt
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Skapar…" : "Skapa tävling"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
