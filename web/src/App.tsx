import { type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { MonitorsPage } from './pages/MonitorsPage';
import { MonitorDetailPage } from './pages/MonitorDetailPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { IncidentDetailPage } from './pages/IncidentDetailPage';
import { StatusPagesPage } from './pages/StatusPagesPage';
import { PublicStatusPage } from './pages/PublicStatusPage';
import { SettingsPage } from './pages/SettingsPage';

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/status/:slug" element={<PublicStatusPage />} />
      <Route path="/" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/monitors" element={<Protected><MonitorsPage /></Protected>} />
      <Route path="/monitors/:monitorId" element={<Protected><MonitorDetailPage /></Protected>} />
      <Route path="/incidents" element={<Protected><IncidentsPage /></Protected>} />
      <Route path="/incidents/:incidentId" element={<Protected><IncidentDetailPage /></Protected>} />
      <Route path="/status-pages" element={<Protected><StatusPagesPage /></Protected>} />
      <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
