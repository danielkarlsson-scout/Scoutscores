import { useCompetition } from "@/contexts/CompetitionContext";
import { CompetitionForm } from "@/components/forms/CompetitionForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Trophy,
  Calendar,
  Flag,
  Users,
  Archive,
  RotateCcw,
  Trash2,
  Play,
  CheckCircle2,
  Pencil,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

// Minimal DB-Competition typ (matcha din competitions-tabell)
// Lägg gärna denna i en gemensam types-fil om du vill.
type Competition = {
  id: string;
  name: string;
  date: string | null;
  is_active: boolean;
  registration_open?: boolean;
  created_at?: string;
  updated_at?: string;
};

export default function Competitions() {
  const {
    competitions, // <-- ALLA tävlingar från DB
    loading,
    selected,
    setSelected,
    updateCompetition,
    deleteCompetition,
  } = useCompetition();

  const [view, setView] = useState<"active" | "archived">("active");
  const [editingCompetition, setEditingCompetition] = useState<Competition | null>(null);
  const [editName, setEditName] = useState("");
  const [editDate, setEditDate] = useState("");

  const navigate = useNavigate();

  const activeCompetitions = useMemo(
    () => (competitions ?? []).filter((c: Competition) => c.is_active),
    [competitions]
  );
  const archivedCompetitions = useMemo(
    () => (competitions ?? []).filter((c: Competition) => !c.is_active),
    [competitions]
  );

  const list = view === "active" ? activeCompetitions : archivedCompetitions;

  const handleSelectAndNavigate = async (comp: Competition) => {
    setSelected(comp);
    navigate("/");
  };

  const handleEditClick = (comp: Competition) => {
    setEditingCompetition(comp);
    setEditName(comp.name);
    setEditDate(comp.date ?? "");
  };

  const handleEditSave = async () => {
    if (!editingCompetition) return;
    if (!editName.trim()) return;

    await Promise.resolve(
      updateCompetition(editingCompetition.id, {
        name: editName.trim(),
        date: editDate,
      })
    );

    setEditingCompetition(null);
  };

  const closeCompetition = async (id: string) => {
    await Promise.resolve(updateCompetition(id, { is_active: false }));
  };

  const reopenCompetition = async (id: string) => {
    await Promise.resolve(updateCompetition(id, { is_active: true }));
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("sv-SE", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tävlingar</h1>
          <p className="text-muted-foreground">Laddar tävlingar…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tävlingar</h1>
          <p className="text-muted-foreground">Hantera alla dina scouttävlingar</p>
        </div>
        <CompetitionForm />
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as "active" | "archived")}>
        <TabsList>
          <TabsTrigger value="active" className="gap-2">
            <Play className="h-4 w-4" />
            Aktiva ({activeCompetitions.length})
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-2">
            <Archive className="h-4 w-4" />
            Arkiverade ({archivedCompetitions.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {list.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((comp: Competition) => {
            const isSelected = selected?.id === comp.id;
            const isActive = comp.is_active;

            return (
              <Card
                key={comp.id}
                className={cn(
                  "relative transition-all hover:shadow-md",
                  isSelected && "ring-2 ring-primary"
                )}
              >
                {isSelected && (
                  <Badge className="absolute -top-2 -right-2 gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Vald
                  </Badge>
                )}

                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-lg truncate">{comp.name}</CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(comp.date)}
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleEditClick(comp)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      <Badge variant={isActive ? "default" : "secondary"}>
                        {isActive ? "Aktiv" : "Avslutad"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Räknare: just nu 0 eftersom DB-koppling till stationer/patruller/poäng kan vara separat */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted p-2">
                      <Flag className="h-4 w-4 mx-auto text-muted-foreground" />
                      <p className="text-lg font-bold">0</p>
                      <p className="text-xs text-muted-foreground">Stationer</p>
                    </div>
                    <div className="rounded-lg bg-muted p-2">
                      <Users className="h-4 w-4 mx-auto text-muted-foreground" />
                      <p className="text-lg font-bold">0</p>
                      <p className="text-xs text-muted-foreground">Patruller</p>
                    </div>
                    <div className="rounded-lg bg-muted p-2">
                      <Trophy className="h-4 w-4 mx-auto text-muted-foreground" />
                      <p className="text-lg font-bold">0</p>
                      <p className="text-xs text-muted-foreground">Poäng</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {isActive ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleSelectAndNavigate(comp)}
                          className="flex-1"
                        >
                          Välj tävling
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Archive className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Avsluta tävling?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{comp.name}" kommer att arkiveras. Du kan öppna den igen senare om du vill.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Avbryt</AlertDialogCancel>
                              <AlertDialogAction onClick={() => closeCompetition(comp.id)}>
                                Avsluta tävling
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reopenCompetition(comp.id)}
                          className="flex-1 gap-1"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Återöppna
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Ta bort tävling?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{comp.name}" kommer att raderas permanent. Denna åtgärd går inte att ångra.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Avbryt</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => Promise.resolve(deleteCompetition(comp.id))}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Ta bort permanent
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>

                  {/* Om du vill visa "öppen registrering" i UI */}
                  {comp.registration_open && (
                    <p className="text-xs text-muted-foreground text-center">
                      Publik anmälan: Öppen
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            {view === "active" ? (
              <>
                <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Inga aktiva tävlingar</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Skapa din första tävling för att komma igång.
                </p>
                <CompetitionForm />
              </>
            ) : (
              <>
                <Archive className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Inga arkiverade tävlingar</h3>
                <p className="text-muted-foreground text-center">
                  Avslutade tävlingar visas här.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Competition Dialog */}
      <Dialog open={!!editingCompetition} onOpenChange={(open) => !open && setEditingCompetition(null)}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleEditSave();
            }}
          >
            <DialogHeader>
              <DialogTitle>Redigera tävling</DialogTitle>
              <DialogDescription>Ändra namn eller datum på tävlingen.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Tävlingsnamn</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="T.ex. Vårscoutkampen 2026"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-date">Datum</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingCompetition(null)}>
                Avbryt
              </Button>
              <Button type="submit">Spara ändringar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
