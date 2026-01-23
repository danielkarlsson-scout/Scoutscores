import { useCompetition } from '@/contexts/CompetitionContext';
import { StationForm } from '@/components/forms/StationForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SectionBadge } from '@/components/ui/section-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Flag, Pencil, Trash2, Mail } from 'lucide-react';
import { SCOUT_SECTIONS } from '@/types/competition';

export default function Stations() {
  const { stations, deleteStation } = useCompetition();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stationer</h1>
          <p className="text-muted-foreground">Hantera tävlingens stationer</p>
        </div>
        <StationForm />
      </div>

      {stations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" />
              Alla stationer ({stations.length})
            </CardTitle>
            <CardDescription>
              Klicka på en station för att redigera
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Namn</TableHead>
                  <TableHead className="hidden sm:table-cell">Beskrivning</TableHead>
                  <TableHead className="text-right">Max poäng</TableHead>
                  <TableHead className="hidden lg:table-cell">Avdelningar</TableHead>
                  <TableHead className="hidden md:table-cell">Ansvarig</TableHead>
                  <TableHead className="w-24">Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stations.map(station => (
                  <TableRow key={station.id}>
                    <TableCell className="font-medium">{station.name}</TableCell>
                    <TableCell className="hidden sm:table-cell max-w-xs truncate text-muted-foreground">
                      {station.description || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">{station.maxScore}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {station.allowedSections && station.allowedSections.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {station.allowedSections.map(section => (
                            <SectionBadge key={section} section={section} size="sm" />
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Alla</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {station.leaderEmail ? (
                        <a 
                          href={`mailto:${station.leaderEmail}`}
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <Mail className="h-3 w-3" />
                          {station.leaderEmail}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <StationForm
                          station={station}
                          trigger={
                            <Button variant="ghost" size="icon">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Ta bort station?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Detta kommer att ta bort stationen "{station.name}" och alla
                                tillhörande poäng. Denna åtgärd går inte att ångra.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Avbryt</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteStation(station.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Ta bort
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Flag className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Inga stationer ännu</h3>
            <p className="text-muted-foreground text-center mb-4">
              Skapa din första station för att komma igång med tävlingen.
            </p>
            <StationForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
