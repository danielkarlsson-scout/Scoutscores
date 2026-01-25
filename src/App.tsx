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

// Intern/admin-sida (behåll om den används)
import PatrolRegistration from "./pages/PatrolRegistration";

// ✅ NY PUBLIK SIDA
import Anmalan from "@/pages/Anmalan";

const queryClient = new QueryClient();

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
              {/* Publika auth-routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />

              {/* Publik anmälningssida */}
              <Route path="/anmalan" element={<Anmalan />} />

              {/* Publik resultattavla */}
              <Route path="/scoreboard" element={<ScoreboardWrapper />} />

              {/* Skyddade routes */}
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

              {/* Ev. intern sida för hantering */}
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

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </CompetitionProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
