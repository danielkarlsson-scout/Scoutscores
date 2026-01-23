import { useCompetition } from '@/contexts/CompetitionContext';
import { PatrolForm } from '@/components/forms/PatrolForm';
import { PatrolRegistrations } from '@/components/PatrolRegistrations';
import { SectionBadge } from '@/components/ui/section-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Users, Pencil, Trash2, Building2 } from 'lucide-react';
import { useState } from 'react';
import { ScoutSection, SCOUT_SECTIONS } from '@/types/competition';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Patrols() {
  const { patrols, deletePatrol, getScoutGroupName } = useCompetition();
  const [selectedSection, setSelectedSection] = useState<ScoutSection | 'all'>('all');

  const filteredPatrols = selectedSection === 'all' 
    ? patrols 
    : patrols.filter(p => p.section === selectedSection);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Patruller</h1>
          <p className="text-muted-foreground">Hantera tävlingens patruller</p>
        </div>
        <PatrolForm />
      </div>

      {/* Patrol Registrations Section */}
      <PatrolRegistrations />

      <Tabs value={selectedSection} onValueChange={(v) => setSelectedSection(v as ScoutSection | 'all')}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">Alla ({patrols.length})</TabsTrigger>
          {(Object.entries(SCOUT_SECTIONS) as [ScoutSection, { name: string }][]).map(([key, value]) => (
            <TabsTrigger key={key} value={key}>
              {value.name} ({patrols.filter(p => p.section === key).length})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filteredPatrols.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {selectedSection === 'all' ? 'Alla patruller' : SCOUT_SECTIONS[selectedSection].name}
              ({filteredPatrols.length})
            </CardTitle>
            <CardDescription>
              Klicka på en patrull för att redigera
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Namn</TableHead>
                  <TableHead>Avdelning</TableHead>
                  <TableHead className="hidden md:table-cell">Kår</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Medlemmar</TableHead>
                  <TableHead className="w-24">Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPatrols.map(patrol => (
                  <TableRow key={patrol.id}>
                    <TableCell className="font-medium">{patrol.name}</TableCell>
                    <TableCell>
                      <SectionBadge section={patrol.section} size="sm" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {patrol.scoutGroupId ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          {getScoutGroupName(patrol.scoutGroupId) || '-'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell">
                      {patrol.members || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <PatrolForm
                          patrol={patrol}
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
                              <AlertDialogTitle>Ta bort patrull?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Detta kommer att ta bort patrullen "{patrol.name}" och alla
                                tillhörande poäng. Denna åtgärd går inte att ångra.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Avbryt</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deletePatrol(patrol.id)}
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
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {selectedSection === 'all' ? 'Inga patruller ännu' : `Inga ${SCOUT_SECTIONS[selectedSection].name}-patruller`}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {selectedSection === 'all' 
                ? 'Skapa din första patrull för att komma igång.'
                : 'Lägg till patruller i denna avdelning.'}
            </p>
            <PatrolForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
