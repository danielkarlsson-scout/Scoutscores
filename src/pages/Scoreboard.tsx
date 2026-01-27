import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useCompetition } from "@/contexts/CompetitionContext";
import { useAuth } from "@/contexts/AuthContext";
import { SectionBadge } from "@/components/ui/section-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Share2, Medal, Building2, TreePine, LogIn } from "lucide-react";
import { ScoutSection, SCOUT_SECTIONS } from "@/types/competition";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";

export default function Scoreboard() {
  const { stations, getPatrolsWithScores, getScoutGroupName, competition } = useCompetition();
  const { user, isAdmin } = useAuth();
  const [selectedSection, setSelectedSection] = useState<ScoutSection | "all">("all");

  const patrolsWithScores = getPatrolsWithScores(selectedSection === "all" ? undefined : selectedSection);

  // Ny: rankning med tie-break på antal fullpoäng (dvs antal stationer där patrullen har station.maxScore)
  const rankedPatrols = useMemo(() => {
    // Kopiera så vi inte muterar ursprungligt array
    const list = [...patrolsWithScores];

    list.sort((a, b) => {
      // 1) totalScore desc
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;

      // 2) count of full-score (stationScores[station.id] === station.maxScore) desc
      const aFull = stations.reduce((acc, st) => acc + (a.stationScores[st.id] === st.maxScore ? 1 : 0), 0);
      const bFull = stations.reduce((acc, st) => acc + (b.stationScores[st.id] === st.maxScore ? 1 : 0), 0);
      if (bFull !== aFull) return bFull - aFull;

      // 3) fallback: namn a-ö (svensk lokal)
      return a.name.localeCompare(b.name, "sv", { sensitivity: "base" });
    });

    // Tilldela rank (1..n). Om du vill hantera delade ranker på annat sätt, går det att justera här.
    return list.map((p, idx) => ({ ...p, rank: idx + 1 }));
  }, [patrolsWithScores, stations]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Resultattavla - ${competition?.name}`,
          url,
        });
      } catch {
        // User cancelled sharing
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Länk kopierad till urklipp!");
    }
  };

  const getMedalIcon = (rank: number | undefined) => {
    if (rank === 1) return <Medal className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
    return <span className="w-5 text-center font-bold text-muted-foreground">{rank ?? "-"}</span>;
  };

  // Wrap content in a public-friendly layout
  const content = (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Resultattavla</h1>
          <p className="text-muted-foreground">{competition?.name} - Liveresultat</p>
        </div>
        <Button variant="outline" onClick={handleShare}>
          <Share2 className="h-4 w-4 mr-2" />
          Dela
        </Button>
      </div>

      <Tabs value={selectedSection} onValueChange={(v) => setSelectedSection(v as ScoutSection | "all")}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">Alla</TabsTrigger>
          {(Object.entries(SCOUT_SECTIONS) as [ScoutSection, { name: string }][]).map(([key, value]) => (
            <TabsTrigger key={key} value={key}>
              {value.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {rankedPatrols.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-secondary" />
              {selectedSection === "all" ? "Alla patruller" : SCOUT_SECTIONS[selectedSection].name}
            </CardTitle>
            <CardDescription>Rangordnat efter totalpoäng</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Plats</TableHead>
                  <TableHead>Patrull</TableHead>
                  <TableHead className="hidden sm:table-cell">Avdelning</TableHead>
                  <TableHead className="hidden lg:table-cell">Kår</TableHead>
                  <TableHead className="text-right font-bold">Totalt</TableHead>
                  {stations.map((station) => (
                    <TableHead key={station.id} className="text-right hidden md:table-cell">
                      <span className="text-xs">{station.name}</span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankedPatrols.map((patrol) => (
                  <TableRow key={patrol.id} className={cn((patrol.rank ?? 999) <= 3 && "bg-secondary/10")}>
                    <TableCell>
                      <div className="flex items-center justify-center">{getMedalIcon(patrol.rank)}</div>
                    </TableCell>
                    <TableCell className="font-medium">{patrol.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <SectionBadge section={patrol.section} size="sm" />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {patrol.scoutGroupId ? (
                        <span className="flex items-center gap-1 text-muted-foreground text-sm">
                          <Building2 className="h-3 w-3" />
                          {getScoutGroupName(patrol.scoutGroupId) || "-"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-bold text-lg">{patrol.totalScore}</span>
                    </TableCell>
                    {stations.map((station) => (
                      <TableCell key={station.id} className="text-right hidden md:table-cell font-mono text-sm">
                        {patrol.stationScores[station.id] ?? "-"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Inga resultat ännu</h3>
            <p className="text-muted-foreground text-center">
              {selectedSection === "all"
                ? "Registrera poäng för att se resultat här."
                : `Inga ${SCOUT_SECTIONS[selectedSection].name}-patruller har poäng ännu.`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Quick stats */}
      {rankedPatrols.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Medal className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Ledare</p>
                <p className="font-bold text-lg">{rankedPatrols[0]?.name}</p>
                <p className="text-2xl font-bold text-primary">{rankedPatrols[0]?.totalScore}p</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">Genomsnitt</p>
                <p className="text-3xl font-bold">
                  {Math.round(rankedPatrols.reduce((sum, p) => sum + p.totalScore, 0) / rankedPatrols.length)}p
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">Högsta möjliga</p>
                <p className="text-3xl font-bold">{stations.reduce((sum, s) => sum + s.maxScore, 0)}p</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );

  // For public visitors (not logged in), show a simple header
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <div className="container flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <TreePine className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold text-primary">ScoutScore</span>
            </div>
            <Link to="/login">
              <Button variant="outline" size="sm">
                <LogIn className="h-4 w-4 mr-2" />
                Logga in
              </Button>
            </Link>
          </div>
        </header>
        <main className="container px-4 py-6">
          {content}
        </main>
      </div>
    );
  }

  // For logged-in admins, show with AppLayout
  if (isAdmin) {
    return (
      <AppLayout>
        {content}
      </AppLayout>
    );
  }

  // For scorers (who shouldn't see this page in nav), show simple layout
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <TreePine className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold text-primary">ScoutScore</span>
          </div>
          <Link to="/scoring">
            <Button variant="outline" size="sm">
              Tillbaka till poäng
            </Button>
          </Link>
        </div>
      </header>
      <main className="container px-4 py-6">
        {content}
      </main>
    </div>
  );
}
