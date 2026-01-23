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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Building2, Download, Save, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

interface ScoutGroupFormProps {
  trigger?: React.ReactNode;
  group?: {
    id: string;
    name: string;
  };
  onSuccess?: () => void;
}

export function ScoutGroupForm({ trigger, group, onSuccess }: ScoutGroupFormProps) {
  const { addScoutGroup, updateScoutGroup } = useCompetition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group?.name ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (group) {
      updateScoutGroup(group.id, name);
    } else {
      addScoutGroup(name);
    }

    setOpen(false);
    setName('');
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Lägg till kår
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {group ? 'Redigera kår' : 'Ny kår'}
            </DialogTitle>
            <DialogDescription>
              {group 
                ? 'Uppdatera kårens namn.'
                : 'Lägg till en ny kår till tävlingen.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Kårnamn</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="T.ex. Örnsköldsviks scoutkår"
                required
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button type="submit">
              {group ? 'Spara' : 'Skapa kår'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ScoutGroupTemplateManager() {
  const { 
    scoutGroups, 
    scoutGroupTemplates, 
    saveCurrentGroupsAsTemplate, 
    importScoutGroupsFromTemplate,
    deleteScoutGroupTemplate 
  } = useCompetition();
  
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (templateName.trim() && scoutGroups.length > 0) {
      saveCurrentGroupsAsTemplate(templateName);
      setTemplateName('');
      setSaveDialogOpen(false);
    }
  };

  const handleImportTemplate = () => {
    if (selectedTemplateId) {
      importScoutGroupsFromTemplate(selectedTemplateId);
      setSelectedTemplateId('');
      setImportDialogOpen(false);
    }
  };

  return (
    <div className="flex gap-2">
      {/* Save as template button */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" disabled={scoutGroups.length === 0}>
            <Save className="h-4 w-4 mr-2" />
            Spara som mall
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={handleSaveTemplate}>
            <DialogHeader>
              <DialogTitle>Spara kårer som mall</DialogTitle>
              <DialogDescription>
                Spara nuvarande kårer ({scoutGroups.length} st) som en mall för att enkelt importera dem till andra tävlingar.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="templateName">Mallnamn</Label>
                <Input
                  id="templateName"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="T.ex. Regionkårer 2024"
                  required
                />
              </div>
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">Kårer som sparas:</p>
                <ul className="list-disc list-inside">
                  {scoutGroups.map(g => (
                    <li key={g.id}>{g.name}</li>
                  ))}
                </ul>
              </div>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaveDialogOpen(false)}>
                Avbryt
              </Button>
              <Button type="submit">
                Spara mall
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import from template button */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" disabled={scoutGroupTemplates.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Importera från mall
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importera kårer från mall</DialogTitle>
            <DialogDescription>
              Välj en mall för att importera kårer till denna tävling. Kårer som redan finns kommer inte att dupliceras.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="template">Välj mall</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj en mall" />
                </SelectTrigger>
                <SelectContent>
                  {scoutGroupTemplates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({template.groups.length} kårer)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {selectedTemplateId && (
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">Kårer i mallen:</p>
                <ul className="list-disc list-inside">
                  {scoutGroupTemplates
                    .find(t => t.id === selectedTemplateId)
                    ?.groups.map((name, i) => (
                      <li key={i}>{name}</li>
                    ))}
                </ul>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleImportTemplate} disabled={!selectedTemplateId}>
              Importera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ScoutGroupList() {
  const { scoutGroups, deleteScoutGroup, patrols } = useCompetition();

  const getPatrolCount = (groupId: string) => {
    return patrols.filter(p => p.scoutGroupId === groupId).length;
  };

  if (scoutGroups.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Inga kårer ännu</h3>
          <p className="text-muted-foreground text-center mb-4">
            Skapa kårer för att kunna koppla patruller till dem.
          </p>
          <div className="flex flex-col gap-2 items-center">
            <ScoutGroupForm />
            <ScoutGroupTemplateManager />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Kårer ({scoutGroups.length})
        </CardTitle>
        <CardDescription>
          Hantera kårer för denna tävling
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Namn</TableHead>
              <TableHead className="text-right">Patruller</TableHead>
              <TableHead className="w-24">Åtgärder</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scoutGroups.map(group => (
              <TableRow key={group.id}>
                <TableCell className="font-medium">{group.name}</TableCell>
                <TableCell className="text-right">{getPatrolCount(group.id)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <ScoutGroupForm
                      group={group}
                      trigger={
                        <Button variant="ghost" size="icon">
                          <Building2 className="h-4 w-4" />
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
                          <AlertDialogTitle>Ta bort kår?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Detta kommer att ta bort kåren "{group.name}". 
                            Patruller som tillhör kåren kommer att bli utan kårtillhörighet.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Avbryt</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteScoutGroup(group.id)}
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
  );
}
