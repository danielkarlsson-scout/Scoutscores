import { useCompetition } from '@/contexts/CompetitionContext';
import { useAuth } from '@/contexts/AuthContext';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Flag, Users, Trophy, Target, AlertCircle } from 'lucide-react';
import { SCOUT_SECTIONS, ScoutSection } from '@/types/competition';
import { SectionBadge } from '@/components/ui/section-badge';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CompetitionForm } from '@/components/forms/CompetitionForm';

export default function Dashboard() {
  const { competition, stations, patrols, scores, getPatrolsWithScores } = useCompetition();
  const { isAdmin, isScorer } = useAuth()
  // Show prompt to create/select competition if none selected
  if (!competition) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Välkommen till ScoutScore</h1>
          <p className="text-muted-foreground">Poängregistrering för scouttävlingar</p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Ingen tävling vald</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              Skapa en ny tävling eller välj en befintlig för att komma igång med
              poängregistrering.
            </p>
            <div className="flex gap-3">
              {isAdmin && <CompetitionForm />}
              <Button asChild variant="outline">
                <Link to="/competitions">Visa alla tävlingar</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalMaxScore = stations.reduce((sum, s) => sum + s.maxScore, 0);
  const topPatrols = getPatrolsWithScores().slice(0, 5);

  const patrolsBySection = (Object.keys(SCOUT_SECTIONS) as ScoutSection[]).map(section => ({
    section,
    count: patrols.filter(p => p.section === section).length,
  }));

      return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{competition.name}</h1>
        <p className="text-muted-foreground">
          {new Date(competition.date).toLocaleDateString('sv-SE', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Stationer"
          value={stations.length}
          description={`Max ${totalMaxScore} poäng totalt`}
          icon={Flag}
        />
        <StatCard
          title="Patruller"
          value={patrols.length}
          description={`I ${patrolsBySection.filter((s) => s.count > 0).length} avdelningar`}
          icon={Users}
        />
        <StatCard
          title="Registrerade poäng"
          value={scores.length}
          description={`Av ${stations.length * patrols.length} möjliga`}
          icon={Target}
        />
        <StatCard
          title="Genomsnittspoäng"
          value={
            patrols.length > 0
              ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / patrols.length)
              : 0
          }
          description="Per patrull"
          icon={Trophy}
        />
      </div>

      {/* Admin-only: Topplista (visas inte för scorer) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-secondary" />
              Topplista
            </CardTitle>
            <CardDescription>Ledande patruller just nu</CardDescription>
          </CardHeader>
          <CardContent>
            {topPatrols.length > 0 ? (
              <div className="space-y-3">
                {topPatrols.map((patrol, index) => (
                  <div key={patrol.id} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{patrol.name}</p>
                      <SectionBadge section={patrol.section} size="sm" />
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{patrol.totalScore}</p>
                      <p className="text-xs text-muted-foreground">poäng</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                Inga poäng registrerade ännu
              </p>
            )}

            <Button asChild variant="outline" className="w-full mt-4">
              <Link to="/scoreboard">Visa fullständig resultattavla</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Webblayout: Patruller per avdelning bredvid Snabbstart */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Patrols by Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Patruller per avdelning
            </CardTitle>
            <CardDescription>Fördelning av deltagande patruller</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {patrolsBySection.map(({ section, count }) => (
                <div key={section} className="flex items-center gap-3">
                  <SectionBadge section={section} />
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full transition-all section-${section}`}
                        style={{
                          width: `${patrols.length > 0 ? (count / patrols.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="font-medium w-8 text-right">{count}</span>
                </div>
              ))}
            </div>

            {isAdmin && (
              <Button asChild variant="outline" className="w-full mt-4">
                <Link to="/patrols">Hantera patruller</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Snabbstart</CardTitle>
            <CardDescription>Kom igång med tävlingen</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {isAdmin && (
                <>
                  <Button asChild>
                    <Link to="/stations">
                      <Flag className="h-4 w-4 mr-2" />
                      Hantera stationer
                    </Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link to="/patrols">
                      <Users className="h-4 w-4 mr-2" />
                      Hantera patruller
                    </Link>
                  </Button>
                </>
              )}

              <Button asChild variant="outline">
                <Link to="/scoring">
                  <Target className="h-4 w-4 mr-2" />
                  Registrera poäng
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
  }
