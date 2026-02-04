import { useEffect, useMemo, useState } from "react";
import { useCompetition } from "@/contexts/CompetitionContext";
import { useAuth } from "@/contexts/AuthContext";
import { SectionBadge } from "@/components/ui/section-badge";
import { ScoreInput } from "@/components/ui/score-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  RotateCcw,
} from "lucide-react";
import { ScoutSection, SCOUT_SECTIONS } from "@/types/competition";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// ✅ Fast ordning för avdelningar: Spårare, Upptäckare, Äventyrare, Utmanare, Rover
const SECTION_SORT_ORDER: ScoutSection[] = ["sparare", "upptackare", "aventyrare", "utmanare", "rover"] as ScoutSection[];

const sectionRank = (s: ScoutSection) => {
  const idx = SECTION_SORT_ORDER.indexOf(s);
  return idx === -1 ? 999 : idx;
};

const sectionLabel = (section: ScoutSection) =>
  SCOUT_SECTIONS[section]?.name ?? String(section);

export default function Scoring() {
  const { stations, patrols, setScore, getScore, getScoreSaveState, retrySaveScore } = useCompetition();
  const { isAdmin, isScorer, canScoreSection } = useAuth();

  const [selectedStation, setSelectedStation] = useState<string>("");
  const [selectedSections, setSelectedSections] = useState<ScoutSection[]>([]);

  const canScore = isAdmin || isScorer;

  // Håll selectedStation giltig.
  // Viktigt: när man filtrerar stationer kan den valda stationen försvinna ur listan,
  // och då kan <Select> (shadcn/radix) krascha internt när den försöker rendera label.
  const filteredStations = useMemo(() => {
    if (selectedSections.length === 0) return stations;
    return stations.filter((station) => {
      if (!station.allowedSections || station.allowedSections.length === 0) return true;
      return station.allowedSections.some((s) => selectedSections.includes(s));
    });
  }, [stations, selectedSections]);

  useEffect(() => {
    if (!stations || stations.length === 0) {
      setSelectedStation("");
      return;
    }

    // Om filtret gör att stationen försvinner, välj första i filtrerade listan.
    const pool = filteredStations.length > 0 ? filteredStations : stations;
    const stillExists = selectedStation && pool.some((s) => s.id === selectedStation);
    if (!stillExists) setSelectedStation(pool[0].id);
  }, [stations, filteredStations, selectedStation]);

  const toggleSection = (section: ScoutSection) => {
    setSelectedSections((prev) => (prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]));
  };

  const clearFilters = () => setSelectedSections([]);

  const currentStation = useMemo(() => stations.find((s) => s.id === selectedStation), [stations, selectedStation]);

  // ✅ Filtrera + sortera patruller:
  // 1) Avdelning enligt fast ordning
  // 2) Namn A–Ö inom avdelning
  const filteredPatrols = useMemo(() => {
    const list = patrols.filter((patrol) => {
      if (selectedSections.length > 0 && !selectedSections.includes(patrol.section)) return false;
      if (currentStation?.allowedSections && currentStation.allowedSections.length > 0) {
        return currentStation.allowedSections.includes(patrol.section);
      }
      return true;
    });

    return list.sort((a, b) => {
      const diff = sectionRank(a.section) - sectionRank(b.section);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, "sv");
    });
  }, [patrols, selectedSections, currentStation]);

  const renderSaveStatus = (patrolId: string, stationId: string) => {
    const state = getScoreSaveState(patrolId, stationId);

    if (state === "saving") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Sparar…
        </span>
      );
    }

    if (state === "saved") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Sparad
        </span>
      );
    }

    if (state === "error") {
      return (
        <span className="inline-flex items-center gap-2 text-xs text-destructive">
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Kunde inte spara
          </span>

          <button
            type="button"
            onClick={() => retrySaveScore(patrolId, stationId)}
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Försök igen
          </button>
        </span>
      );
    }

    return null;
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
            <p className="text-muted-foreground text-center">Skapa stationer först för att kunna registrera poäng.</p>
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
            <p className="text-muted-foreground text-center">Skapa patruller först för att kunna registrera poäng.</p>
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
              {/* ✅ Visa avdelningar i fast ordning även i filtret */}
              {SECTION_SORT_ORDER.map((section) => (
                <DropdownMenuCheckboxItem
                  key={section}
                  checked={selectedSections.includes(section)}
                  onCheckedChange={() => toggleSection(section)}
                >
                  {sectionLabel(section)}
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
                      [{station.allowedSections.map((s) => sectionLabel(s)).join(", ")}]
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
          {selectedSections
            .slice()
            .sort((a, b) => sectionRank(a) - sectionRank(b))
            .map((section) => (
              <Badge
                key={section}
                variant="secondary"
                className="gap-1 cursor-pointer hover:bg-destructive/20"
                onClick={() => toggleSection(section)}
              >
                {sectionLabel(section)}
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
                  • Endast: {currentStation.allowedSections.map((s) => sectionLabel(s)).join(", ")}
                </span>
              )}
              <span className="ml-2">• Visar {filteredPatrols.length} patruller</span>
            </CardDescription>
          </CardHeader>

          <CardContent>
            {filteredPatrols.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">Inga patruller i valda avdelningar.</p>
            ) : (
              <div className="space-y-6">
                {filteredPatrols.map((patrol) => {
                  const hasPermission = canScoreSection(patrol.section);
                  const value = getScore(patrol.id, currentStation.id);

                  return (
                    <div key={patrol.id} className="flex items-center gap-4 py-2 border-b last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium whitespace-normal break-words leading-snug">{patrol.name}</p>

                        <div className="flex flex-wrap items-center gap-2">
                          <SectionBadge section={patrol.section} size="sm" />
                          {hasPermission && renderSaveStatus(patrol.id, currentStation.id)}
                        </div>
                      </div>

                      {hasPermission ? (
                        <ScoreInput
                          value={value}
                          maxScore={currentStation.maxScore}
                          onChange={async (newScore) => {
                            await setScore(patrol.id, currentStation.id, newScore);
                          }}
                        />
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Lock className="h-4 w-4" />
                          <span className="text-sm">{value ?? "-"}</span>
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
