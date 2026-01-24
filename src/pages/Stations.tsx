import { useCompetition } from "@/contexts/CompetitionContext";
import { StationForm } from "@/components/forms/StationForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Building2, Trash2 } from "lucide-react";
import { SectionBadge } from "@/components/ui/section-badge";
import { SCOUT_SECTIONS } from "@/types/competition";

export default function Stations() {
  const { stations, deleteStation } = useCompetition();

  if (stations.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Inga stationer ännu</h3>
          <p className="text-muted-foreground text-center mb-4">
            Skapa stationer för att kunna registrera poäng.
          </p>
          <StationForm />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stationer</h1>
          <p className="text-muted-foreground">Hantera stationer för denna tävling</p>
        </div>
        <StationForm />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stationer ({stations.length})</CardTitle>
          <CardDescription>Skapa, redigera och ta bort stationer</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Namn</TableHead>
                <TableHead>Maxpoäng</TableHead>
                <TableHead>Tillåtna grenar</TableHead>
                <TableHead className="w-24 text-right">Åtgärder</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stations.map((station) => (
                <TableRow key={station.id}>
                  <TableCell className="font-medium">{station.name}</TableCell>
                  <TableCell>{station.maxScore}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(station.allowedSections ?? []).map((sec) => (
                        <SectionBadge key={sec} section={sec as any}>
                          {SCOUT_SECTIONS[sec as any]?.name ?? sec}
                        </SectionBadge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <StationForm
                        station={station}
                        trigger={<Button variant="outline" size="sm">Redigera</Button>}
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
                              onClick={async () => {
                                await deleteStation(station.id);
                              }}
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
    </div>
  );
}
