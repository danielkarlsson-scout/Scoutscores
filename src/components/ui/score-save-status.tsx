import { Check, AlertTriangle, Loader2 } from "lucide-react";

export function ScoreSaveStatus({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === "idle") return null;

  if (state === "saving") {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  if (state === "saved") {
    return <Check className="h-4 w-4 text-green-600" />;
  }

  return <AlertTriangle className="h-4 w-4 text-destructive" />;
}
