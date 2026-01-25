import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/layout/ProtectedRoute';

import Scoring from '@/pages/Scoring';
import Profile from '@/pages/Profile';
import Admin from '@/pages/Admin';
import Competitions from '@/pages/Competitions';
import Login from '@/pages/Login';
import AwaitingAccess from '@/pages/AwaitingAccess';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Routes>
                  <Route path="/" element={<Scoring />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/apply" element={<AwaitingAccess />} />

                  <Route path="/admin" element={<Admin />} />
                  <Route path="/competitions" element={<Competitions />} />
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
