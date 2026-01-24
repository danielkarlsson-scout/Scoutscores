import { useState } from "react";
import { useCompetition } from "@/contexts/CompetitionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Station } from "@/types/competition";
import { Checkbox } from "@/components/ui/checkbox";
import { SCOUT_SECTIONS } from "@/types/competition";

interface StationFormProps {
  trigger?: React.ReactNode;
  station?: Station;
  onSuccess?: () => void;
}

export function StationForm({ trigger, station, onSuccess }: StationFormProps) {
  const { addStation, updateStation } = useCompetition();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState(station?.name ?? "");
  const [description, setDescription] = useState(station?.description ?? "");
  const [maxScore, setMaxScore] = useState(station?.maxScore ?? 10);
  const [leaderEmail, setLeaderEmail] = useState(station?.leaderEmail ?? "");
  const [allowedSections, setAllowedSections] = useState<string[]>(
    station?.allowedSections ?? []
  );

  const toggleSection = (section: string) => {
    setAllowedSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      name: name.trim(),
      description: description.trim(),
      maxScore: Number(maxScore),
      leaderEmail: leaderEmail.trim() || undefined,
      allowedSections: allowedSections.length > 0 ? (allowedSections as any) : undefined,
    };

    if (!data.name) return;

    if (station) {
      await updateStation(station.id, data);
    } else {
      await addStation(data);
    }

    setOpen(false);
    setName("");
    setDescription("");
    setMaxScore(10);
    setLeaderEmail("");
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
            <DialogTitle>{station ? "Redigera station" : "Ny station"}</DialogTitle>
            <DialogDescription>
              {station ? "Uppdatera stationens information." : "Skapa en ny station för tävlingen."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Stationsnamn</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="T.ex. Första hjälpen"
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
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="maxScore">Maxpoäng</Label>
              <Input
                id="maxScore"
                type="number"
                value={maxScore}
                onChange={(e) => setMaxScore(Number(e.target.value))}
                min={0}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="leaderEmail">Stationsledare (e-post)</Label>
              <Input
                id="leaderEmail"
                type="email"
                value={leaderEmail}
                onChange={(e) => setLeaderEmail(e.target.value)}
                placeholder="ledare@epost.se"
              />
            </div>

            <div className="grid gap-2">
              <Label>Tillåtna grenar</Label>
              <div className="grid gap-2">
                {Object.entries(SCOUT_SECTIONS).map(([key, info]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={allowedSections.includes(key)}
                      onCheckedChange={() => toggleSection(key)}
                    />
                    {info.name}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button type="submit">{station ? "Spara" : "Skapa station"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
