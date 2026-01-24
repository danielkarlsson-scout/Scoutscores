import { useMemo, useRef, useState } from "react";
import { useCompetition } from "@/contexts/CompetitionContext";
import { useAuth } from "@/contexts/AuthContext";
import { SectionBadge } from "@/components/ui/section-badge";
import { ScoreInput } from "@/components/ui/score-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ClipboardList,
  Flag,
  Filter,
  X,
  Shield,
  Lock,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCcw,
} from "lucide-react";
import { ScoutSection, SCOUT_SECTIONS } from "@/types/competition";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function Scoring() {
  const { stations, patrols, setScore, getScore } = useCompetition();
  const { isAdmin, isScorer, canScoreSection } = useAuth();

  const [selectedStation, setSelectedStation] = useState<string>(
    stations[0]?.id ?? ""
  );
  const [selectedSections, setSelectedSections] = useState<ScoutSection[]>([]);

  // status per "patrolId|stationId"
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [saveError, setSaveError] = useState<Record<string, string | null>>({});

  // för att undvika race: senaste request vinner
  const requestSeqRef = useRef<Record<string, number>>({});

  const canScore = isAdmin || isScorer;

  const filteredStations = useMemo(() => {
    return selectedSections.length === 0
      ? stations
      : stations.filter((station) => {
          if (!station.allowedSections || station.allowedSections.length === 0)
            return true;
          return station.allowedSections.some((s) => selectedSections.includes(s));
        });
  }, [stations, selectedSections]);

  const currentStation = useMemo(() => {
    return stations.find((s) => s.id === selectedStation);
  }, [stations, selectedStation]);

  const filteredPatrols = useMemo(() => {
    return patrols.filter((patrol) => {
      if (selectedSections.length > 0 && !selectedSections.includes(patrol.section)) {
        return false;
      }
      if (currentStation?.allowedSections && currentStation.allowedSections.length > 0) {
        return currentStation.allowedSections.includes(patrol.section);
      }
      return true;
    });
  }, [patrols, selectedSections, currentStation]);

  const toggleSection = (section: ScoutSection) => {
    setSelectedSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );
  };

  const clearFilters = () => setSelectedSections([]);

  const keyFor = (patrolId: string, stationId: string) => `${patrolId}|${stationId}`;

  const setStatus = (k: string, state: SaveState, err: string | null = null) => {
    setSaveState((prev) => ({ ...prev, [k]: state }));
    setSaveError((prev) => ({ ...prev, [k]: err }));
  };

  const handleSetScore = async (patrolId: string, stationId: string, score: number) => {
    const k = keyFor(patrolId, stationId);

    // bump seq
    const seq = (requestSeqRef.current[k] ?? 0) + 1;
    requestSeqRef.current[k] = seq;

    setStatus(k, "saving", null);

    try {
      await setScore(patrolId, stationId, score);

      // om en nyare request har skickats: ignorera resultatet
      if (requestSeqRef.current[k] !== seq) return;

      setStatus(k, "saved", null);

      // gå tillbaka till idle efter en kort stund så UI inte blir “stökigt”
      window.setTimeout(() => {
        // bara om vi fortfarande är "saved" och ingen ny request kommit
        if (requestSeqRef.current[k] === seq) {
          setSaveState((prev) => ({ ...prev, [k]: "idle" }));
        }
      }, 1200);
    } catch (e: any) {
      if (requestSeqRef.current[k] !== seq) return;
      setStatus(k, "error", e?.message ?? "Kunde inte spara poängen.");
    }
  };

  const retrySave = async (patrolId: string, stationId: string) => {
    const current = getScore(patrolId, stationId);
    // om null/undefined, försök inte
    if (typeof current !== "number") return;
    await handleSetScore(patrolId, stationId, current);
  };

  if (!canScore) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Poängregistrering</h1>
          <p className="text-muted-foreground">Registrera poäng för varje patrull</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Ingen behörighet</h3>
            <p className="text-muted-foreground text-center">
              Du har inte behörighet att registrera poäng. Kontakta en administratör för att få tillgång.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (stations.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Poängregistrering</h1>
          <p className="text-muted-foreground">Registrera poäng för varje patrull</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Flag className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Inga stationer skapade</h3>
            <p className="text-muted-foreground text-center">
              Skapa stationer först för att kunna registrera poäng.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (patrols.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Poängregistrering</h1>
          <p className="text-muted-foreground">Registrera poäng för varje patrull</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Inga patruller skapade</h3>
            <p className="text-muted-foreground text-center">
              Skapa patruller först för att kunna registrera poäng.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Poängregistrering</h1>
          <p className="text-muted-foreground">Registrera poäng för varje patrull</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto justify-start">
                <Filter className="h-4 w-4 mr-2" />
                {selectedSections.length === 0 ? "Alla avdelningar" : `${selectedSections.length} valda`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-popover">
              {(Object.keys(SCOUT_SECTIONS) as ScoutSection[]).map((section) => (
                <DropdownMenuCheckboxItem
                  key={section}
                  checked={selectedSections.includes(section)}
                  onCheckedChange={() => toggleSection(section)}
                >
                  {SCOUT_SECTIONS[section].name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Select value={selectedStation} onValueChange={setSelectedStation}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Välj station" />
            </SelectTrigger>
            <SelectContent>
              {filteredStations.map((station) => (
                <SelectItem key={station.id} value={station.id}>
                  {station.name} (max {station.maxScore}p)
                  {station.allowedSections && station.allowedSections.length > 0 && (
                    <span className="text-muted-foreground ml-1">
                      [{" "}
                      {station.allowedSections.map((s) => SCOUT_SECTIONS[s].name).join(", ")}
                      {" ]"}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedSections.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Filter:</span>
          {selectedSections.map((section) => (
            <Badge
              key={section}
              variant="secondary"
              className="gap-1 cursor-pointer hover:bg-destructive/20"
              onClick={() => toggleSection(section)}
            >
              {SCOUT_SECTIONS[section].name}
              <X className="h-3 w-3" />
            </Badge>
          ))}
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 px-2 text-xs">
            Rensa alla
          </Button>
        </div>
      )}

      {currentStation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" />
              {currentStation.name}
            </CardTitle>
            <CardDescription>
              {currentStation.description || `Max poäng: ${currentStation.maxScore}`}
              {currentStation.allowedSections && currentStation.allowedSections.length > 0 && (
                <span className="ml-2">
                  • Endast: {currentStation.allowedSections.map((s) => SCOUT_SECTIONS[s].name).join(", ")}
                </span>
              )}
              <span className="ml-2">• Visar {filteredPatrols.length} patruller</span>
            </CardDescription>
          </CardHeader>

          <CardContent>
            {filteredPatrols.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">
                Inga patruller i valda avdelningar.
              </p>
            ) : (
              <div className="space-y-6">
                {filteredPatrols.map((patrol) => {
                  const hasPermission = canScoreSection(patrol.section);
                  const k = keyFor(patrol.id, currentStation.id);
                  const state = saveState[k] ?? "idle";
                  const errMsg = saveError[k];

                  return (
                    <div
                      key={patrol.id}
                      className="flex items-center gap-4 py-2 border-b last:border-0"
                    >
                      <div className="flex-1 min-w-0">
  {/* Mobil: visa hela namnet (wrap). Desktop: kan fortfarande kapa om du vill */}
  <p className="font-medium whitespace-normal break-words sm:whitespace-nowrap sm:truncate">
    {patrol.name}
  </p>
  <SectionBadge section={patrol.section} size="sm" />
</div>

                      {/* STATUS + RETRY */}
                      <div className="w-28 flex justify-end">
                        {state === "saving" && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Sparar…
                          </span>
                        )}

                        {state === "saved" && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <CheckCircle2 className="h-3 w-3" />
                            Sparad
                          </span>
                        )}

                        {state === "error" && (
                          <button
                            type="button"
                            onClick={() => retrySave(patrol.id, currentStation.id)}
                            className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                            title={errMsg ?? "Kunde inte spara. Klicka för att försöka igen."}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Fel
                            <RefreshCcw className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {hasPermission ? (
                        <ScoreInput
                          value={getScore(patrol.id, currentStation.id)}
                          maxScore={currentStation.maxScore}
                          onChange={(score) =>
                            handleSetScore(patrol.id, currentStation.id, score)
                          }
                        />
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Lock className="h-4 w-4" />
                          <span className="text-sm">
                            {getScore(patrol.id, currentStation.id) ?? "-"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
