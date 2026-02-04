import { useEffect, useMemo, useState } from "react";
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
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScoutSection } from "@/types/competition";

const sectionOrder: ScoutSection[] = [
  "sparare",
  "upptackare",
  "aventyrar",
  "utmanare",
  "rover",
];

function sectionRank(section: ScoutSection): number {
  return sectionOrder.indexOf(section);
}

export default function Scoring() {
  const { stations, patrols, setScore, getScore, getScoreSaveState, retrySaveScore } =
    useCompetition();
  const { isAdmin, isScorer, canScoreSection } = useAuth();

  const [selectedStation, setSelectedStation] = useState<string>("");
  const [selectedSections, setSelectedSections] = useState<ScoutSection[]>([]);

  const canScore = isAdmin || isScorer;

  useEffect(() => {
    const list = stations ?? [];
    if (!list || list.length === 0) {
      setSelectedStation("");
      return;
    }

    if (!selectedStation || !list.some((s) => s.id === selectedStation)) {
      setSelectedStation(list[0].id);
    }
  }, [stations, selectedStation]);

  const currentStation = useMemo(
    () => (stations ?? []).find((s) => s.id === selectedStation),
    [stations, selectedStation]
  );

  const filteredPatrols = useMemo(() => {
    const list = [...(patrols ?? [])];

    const passesFilters = (patrol: any) => {
      if (selectedSections.length > 0 && !selectedSections.includes(patrol.section))
        return false;

      if (
        currentStation?.allowedSections &&
        currentStation.allowedSections.length > 0
      ) {
        return currentStation.allowedSections.includes(patrol.section);
      }

      return true;
    };

    return list
      .filter(passesFilters)
      .sort((a, b) => {
        const diff = sectionRank(a.section) - sectionRank(b.section);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name, "sv");
      });
  }, [patrols, selectedSections, currentStation]);

  const renderSaveStatus = (patrolId: string, stationId: string) => {
    const state = getScoreSaveState(patrolId, stationId);

    if (state === "saving") {
      return (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Sparar...
        </div>
      );
    }

    if (state === "saved") {
      return (
        <div className="flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 className="h-3 w-3" />
          Sparad
        </div>
      );
    }

    if (state === "error") {
      return (
        <button
          type="button"
          onClick={() => retrySaveScore(patrolId, stationId)}
          className="flex items-center gap-1 text-xs text-red-600 hover:underline"
        >
          <AlertTriangle className="h-3 w-3" />
          Misslyckades – försök igen
        </button>
      );
    }

    return null;
  };

  if (!canScore) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Poängregistrering</h1>
          <p className="text-muted-foreground">
            Registrera poäng för varje patrull
          </p>
        </div>

        <Card className="border-dashed border-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Ingen behörighet</CardTitle>
            </div>
            <CardDescription>
              Du har inte behörighet att registrera poäng på någon station i denna
              tävling.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-center">
              Kontakta en tävlingsadministratör för att få behörighet som scorer.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const safeStations = stations ?? [];
  const safePatrols = patrols ?? [];

  if (safeStations.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Poängregistrering</h1>
          <p className="text-muted-foreground">
            Registrera poäng för varje patrull
          </p>
        </div>

        <Card className="border-dashed border-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Inga stationer skapade</CardTitle>
            </div>
            <CardDescription>
              Skapa stationer för att kunna registrera poäng i tävlingen.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Inga stationer ännu</h3>
            <p className="text-muted-foreground text-center">
              Be en administratör skapa stationer i tävlingen.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (safePatrols.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Poängregistrering</h1>
          <p className="text-muted-foreground">
            Registrera poäng för varje patrull
          </p>
        </div>

        <Card className="border-dashed border-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Inga patruller skapade</CardTitle>
            </div>
            <CardDescription>
              Skapa patruller först för att kunna registrera poäng.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Inga patruller ännu</h3>
            <p className="text-muted-foreground text-center">
              Be en administratör skapa patruller i tävlingen.
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
          <p className="text-muted-foreground">
            Registrera poäng för varje patrull
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {selectedSections.length === 0
                ? "Alla avdelningar"
                : `${selectedSections.length} valda`}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedSections([])}
            disabled={selectedSections.length === 0}
            className="gap-1"
          >
            <X className="h-4 w-4" />
            Nollställ filter
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Station</CardTitle>
            <CardDescription>Välj station att registrera poäng på.</CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
            {safeStations.map((station) => (
              <Button
                key={station.id}
                variant={station.id === selectedStation ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedStation(station.id)}
                className="gap-2"
              >
                <Flag className="h-4 w-4" />
                <span>{station.name}</span>
                {station.allowedSections && station.allowedSections.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({station.allowedSections.length} avdelningar)
                  </span>
                )}
              </Button>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          {currentStation ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Avdelningar:
                </span>
                {sectionOrder.map((section) => (
                  <button
                    key={section}
                    type="button"
                    onClick={() =>
                      setSelectedSections((prev) =>
                        prev.includes(section)
                          ? prev.filter((s) => s !== section)
                          : [...prev, section]
                      )
                    }
                    className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs hover:bg-muted"
                  >
                    <SectionBadge section={section} />
                    {selectedSections.includes(section) && (
                      <X className="h-3 w-3 text-muted-foreground" />
                    )}
                  </button>
                ))}
              </div>

              {currentStation.allowedSections &&
                currentStation.allowedSections.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Denna station är öppen för{" "}
                    {currentStation.allowedSections
                      .map((s) => s[0].toUpperCase() + s.slice(1))
                      .join(", ")}
                    .
                  </p>
                )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Välj en station för att börja registrera poäng.
            </p>
          )}
        </CardContent>
      </Card>

      {currentStation && (
        <Card>
          <CardHeader>
            <CardTitle>Patruller</CardTitle>
            <CardDescription>
              Registrera poäng för patruller på station{" "}
              <span className="font-semibold">{currentStation.name}</span>.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {filteredPatrols.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  Inga patruller matchar filtret
                </h3>
                <p className="text-muted-foreground text-center">
                  Ändra filter eller kontrollera att patruller finns i tävlingen.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Visar {filteredPatrols.length} patruller
                  </span>
                </div>

                <div className="grid gap-4">
                  {filteredPatrols.map((patrol) => {
                    const value = getScore(patrol.id, currentStation.id);
                    const saveState = getScoreSaveState(
                      patrol.id,
                      currentStation.id
                    );
                    const isSaving = saveState === "saving";

                    const allowed =
                      canScoreSection(patrol.section) &&
                      (!currentStation.allowedSections ||
                        currentStation.allowedSections.length === 0 ||
                        currentStation.allowedSections.includes(patrol.section));

                    return (
                      <div
                        key={patrol.id}
                        className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <SectionBadge section={patrol.section} />
                          <div>
                            <p className="font-medium">{patrol.name}</p>
                            {patrol.scoutGroupId && (
                              <p className="text-xs text-muted-foreground">
                                Patrullens kår-ID: {patrol.scoutGroupId}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          {allowed ? (
                            <>
                              <ScoreInput
                                value={value}
                                max={currentStation.maxScore}
                                onChange={(score) =>
                                  setScore(patrol.id, currentStation.id, score)
                                }
                                disabled={isSaving}
                              />
                              {renderSaveStatus(patrol.id, currentStation.id)}
                            </>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Lock className="h-4 w-4" />
                              <span>Ej behörig för denna avdelning</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
