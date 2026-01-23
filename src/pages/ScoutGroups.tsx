import { ScoutGroupForm, ScoutGroupList, ScoutGroupTemplateManager } from '@/components/forms/ScoutGroupForm';

export default function ScoutGroups() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kårer</h1>
          <p className="text-muted-foreground">Hantera kårer för denna tävling</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ScoutGroupTemplateManager />
          <ScoutGroupForm />
        </div>
      </div>

      <ScoutGroupList />
    </div>
  );
}
