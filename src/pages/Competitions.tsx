import { useCompetition } from '@/contexts/CompetitionContext';
import { CompetitionForm } from '@/components/forms/CompetitionForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Pencil
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Competition } from '@/types/competition';

export default function Competitions() {
  const { 
    activeCompetitions, 
    archivedCompetitions, 
    competition: selectedCompetition,
    selectCompetition,
    closeCompetition,
    reopenCompetition,
    deleteCompetition,
    updateCompetitionById
  } = useCompetition();
  
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [editingCompetition, setEditingCompetition] = useState<Competition | null>(null);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const navigate = useNavigate();

  const competitions = view === 'active' ? activeCompetitions : archivedCompetitions;

  const handleSelectAndNavigate = (id: string) => {
    selectCompetition(id);
    navigate('/');
  };

  const handleEditClick = (comp: Competition) => {
    setEditingCompetition(comp);
    setEditName(comp.name);
    setEditDate(comp.date);
  };

  const handleEditSave = () => {
    if (editingCompetition && editName.trim()) {
      updateCompetitionById(editingCompetition.id, {
        name: editName.trim(),
        date: editDate,
      });
      setEditingCompetition(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tävlingar</h1>
          <p className="text-muted-foreground">Hantera alla dina scouttävlingar</p>
        </div>
        <CompetitionForm />
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as 'active' | 'archived')}>
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

      {competitions.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {competitions.map(comp => (
            <Card 
              key={comp.id} 
              className={cn(
                'relative transition-all hover:shadow-md',
                selectedCompetition?.id === comp.id && 'ring-2 ring-primary'
              )}
            >
              {selectedCompetition?.id === comp.id && (
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
                    <Badge variant={comp.status === 'active' ? 'default' : 'secondary'}>
                      {comp.status === 'active' ? 'Aktiv' : 'Avslutad'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted p-2">
                    <Flag className="h-4 w-4 mx-auto text-muted-foreground" />
                    <p className="text-lg font-bold">{comp.stations.length}</p>
                    <p className="text-xs text-muted-foreground">Stationer</p>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <Users className="h-4 w-4 mx-auto text-muted-foreground" />
                    <p className="text-lg font-bold">{comp.patrols.length}</p>
                    <p className="text-xs text-muted-foreground">Patruller</p>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <Trophy className="h-4 w-4 mx-auto text-muted-foreground" />
                    <p className="text-lg font-bold">{comp.scores.length}</p>
                    <p className="text-xs text-muted-foreground">Poäng</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {comp.status === 'active' ? (
                    <>
                      <Button 
                        size="sm" 
                        onClick={() => handleSelectAndNavigate(comp.id)}
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
                              "{comp.name}" och all tillhörande data kommer att raderas permanent. 
                              Denna åtgärd går inte att ångra.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Avbryt</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => deleteCompetition(comp.id)}
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

                {comp.closedAt && (
                  <p className="text-xs text-muted-foreground text-center">
                    Avslutad {formatDate(comp.closedAt)}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            {view === 'active' ? (
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
          <form onSubmit={(e) => { e.preventDefault(); handleEditSave(); }}>
            <DialogHeader>
              <DialogTitle>Redigera tävling</DialogTitle>
              <DialogDescription>
                Ändra namn eller datum på tävlingen.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Tävlingsnamn</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="T.ex. Vårscoutkampen 2025"
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
              <Button type="submit">
                Spara ändringar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
