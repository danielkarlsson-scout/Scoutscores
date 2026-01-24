import { useEffect, useMemo, useRef, useState } from "react";
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
  Shield,
  Lock,
  Loader2,
  CheckCircle2,
  RefreshCcw,
} from "lucide-react";
import { ScoutSection, SCOUT_SECTIONS } from "@/types/competition";
import { Button } from "@/components/ui/button";
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
  // Hämta hela competition-objektet, så vi kan använda competition.getScore säkert
  const competition = useCompetition();
  const { stations, patrols, setScore } = competition;
  const { isAdmin, isScorer, canScoreSection } = useAuth();

  const [selectedStation, setSelectedStation] = useState<string>("");
  const [selectedSections, setSelectedSections] = useState<ScoutSection[]>([]);

  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const requestSeqRef = useRef<Record<string, number>>({});

  const canScore = isAdmin || isScorer;

  // ✅ Se till att vi väljer en station när stations laddats in
  useEffect(() => {
    if (!selectedStation && stations.length > 0) {
      setSelectedStation(stations[0].id);
    }
  }, [stations, selectedStation]);

  // ✅ Robust: ta en lokal referens till funktionen (undviker "getScore is not defined" i bundlen)
  const getScoreFn = competition.getScore;
  const safeGetScore = (patrolId: string, stationId: string) =>
    typeof getScoreFn === "function" ? getScoreFn(patrolId, stationId) : 0;

  const filteredStations = useMemo(() => {
    return selectedSections.length === 0
      ? stations
      : stations.filter((station) => {
          if (!station.allowedSections || station.allowedSections.length === 0)
            return true;
          return station.allowedSections.some((s) =>
            selectedSections.includes(s)
          );
        });
  }, [stations, selectedSections]);

  const currentStation = useMemo(
    () => stations.find((s) => s.id === selectedStation),
    [stations, selectedStation]
  );

  const filteredPatrols = useMemo(() => {
    return patrols.filter((patrol) => {
      if (
        selectedSections.length > 0 &&
        !selectedSections.includes(patrol.section)
      ) {
        return false;
      }
      if (
        currentStation?.allowedSections &&
        currentStation.allowedSections.length > 0
      ) {
        return currentStation.allowedSections.includes(patrol.section);
      }
      return true;
    });
  }, [patrols, selectedSections, currentStation]);

  const toggleSection = (section: ScoutSection) => {
    setSelectedSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  };

  const keyFor = (patrolId: string, stationId: string) =>
    `${patrolId}|${stationId}`;

  const handleSetScore = async (
    patrolId: string,
    stationId: string,
    score: number
  ) => {
    const k = keyFor(patrolId, stationId);
    const seq = (requestSeqRef.current[k] ?? 0) + 1;
    requestSeqRef.current[k] = seq;

    setSaveState((p) => ({ ...p, [k]: "saving" }));

    try {
      await setScore(patrolId, stationId, score);

      if (requestSeqRef.current[k] !== seq) return;

      setSaveState((p) => ({ ...p, [k]: "saved" }));
      setTimeout(() => {
        if (requestSeqRef.current[k] === seq) {
          setSaveState((p) => ({ ...p, [k]: "idle" }));
        }
      }, 1200);
    } catch {
      if (requestSeqRef.current[k] !== seq) return;
      setSaveState((p) => ({ ...p, [k]: "error" }));
    }
  };

  if (!canScore) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="font-semibold">Ingen behörighet</h3>
        </CardContent>
      </Card>
    );
  }

  if (!currentStation || patrols.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ClipboardList className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="font-semibold">Inga patruller eller stationer</h3>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Poängregistrering
          </h1>
          <p className="text-muted-foreground">
            Registrera poäng för varje patrull
          </p>
        </div>

        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Filter className="mr-2 h-4 w-4" />
                Alla avdelningar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {(Object.keys(SCOUT_SECTIONS) as ScoutSection[]).map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={selectedSections.includes(s)}
                  onCheckedChange={() => toggleSection(s)}
                >
                  {SCOUT_SECTIONS[s].name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Select value={selectedStation} onValueChange={setSelectedStation}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filteredStations.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} (max {s.maxScore})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Station */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            {currentStation.name}
          </CardTitle>
          <CardDescription>
            Max poäng: {currentStation.maxScore} • Visar{" "}
            {filteredPatrols.length} patruller
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {filteredPatrols.map((patrol) => {
            const k = keyFor(patrol.id, currentStation.id);
            const state = saveState[k] ?? "idle";
            const hasPermission = canScoreSection(patrol.section);

            return (
              <div
                key={patrol.id}
                className="flex flex-col gap-3 border-b py-3 last:border-0 sm:flex-row sm:items-center"
              >
                {/* Vänster: namn + badge */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium whitespace-normal break-words sm:truncate">
                    {patrol.name}
                  </p>
                  <SectionBadge section={patrol.section} size="sm" />
                </div>

                {/* Höger: poäng */}
                {hasPermission ? (
                  <div className="flex w-full items-center gap-3 sm:w-auto sm:shrink-0">
                    <ScoreInput
                      value={safeGetScore(patrol.id, currentStation.id)}
                      maxScore={currentStation.maxScore}
                      onChange={(v) =>
                        handleSetScore(patrol.id, currentStation.id, v)
                      }
                    />

                    {state === "saving" && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {state === "saved" && (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                    {state === "error" && (
                      <RefreshCcw className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Lock className="h-4 w-4" />
                    {safeGetScore(patrol.id, currentStation.id) ?? "-"}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
