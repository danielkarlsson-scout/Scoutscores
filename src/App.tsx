import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CompetitionProvider } from "@/contexts/CompetitionContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Competitions from "./pages/Competitions";
import Stations from "./pages/Stations";
import Patrols from "./pages/Patrols";
import ScoutGroups from "./pages/ScoutGroups";
import Scoring from "./pages/Scoring";
import Scoreboard from "./pages/Scoreboard";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
// Behåll eventuell befintlig PatrolRegistration om du vill ha både intern och publik varianter
import PatrolRegistration from "./pages/PatrolRegistration";
// Den nya publika anmälningssidan (lägg till filen src/pages/Anmalan.tsx)
import Anmalan from "@/pages/Anmalan";

const queryClient = new QueryClient();

// Wrapper to conditionally show AppLayout for logged-in users
function ScoreboardWrapper() {
  return <Scoreboard />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <CompetitionProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />

              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <Dashboard />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/competitions"
                element={
                  <ProtectedRoute requireAdmin>
                    <AppLayout>
                      <Competitions />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/stations"
                element={
                  <ProtectedRoute requireAdmin>
                    <AppLayout>
                      <Stations />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/patrols"
                element={
                  <ProtectedRoute requireAdmin>
                    <AppLayout>
                      <Patrols />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/scout-groups"
                element={
                  <ProtectedRoute requireAdmin>
                    <AppLayout>
                      <ScoutGroups />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/scoring"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <Scoring />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Scoreboard is public - anyone with the link can view */}
              <Route path="/scoreboard" element={<ScoreboardWrapper />} />

              {/* Public patrol registration (ny publikt tillgänglig sida) */}
              <Route path="/anmalan" element={<Anmalan />} />

              {/* Behåll intern sida för patrol registration om ni behöver den */}
              <Route
                path="/patrol-registration"
                element={
                  <ProtectedRoute requireAdmin>
                    <AppLayout>
                      <PatrolRegistration />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin"
                element={
                  <ProtectedRoute requireAdmin>
                    <AppLayout>
                      <Admin />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </CompetitionProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
