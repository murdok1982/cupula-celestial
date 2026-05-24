import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { TrackListPage } from '@/pages/TrackListPage';
import { EngagementsPage } from '@/pages/EngagementsPage';
import { InterceptorsPage } from '@/pages/InterceptorsPage';
import { AuditLogPage } from '@/pages/AuditLogPage';
import { SimulatorPage } from '@/pages/SimulatorPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { useAuthStore } from '@/store/authStore';
import { AuthProvider } from '@/auth/AuthProvider';

function ProtectedLayout(): JSX.Element {
  const isAuth = useAuthStore((s) => Boolean(s.accessToken));
  if (!isAuth) return <Navigate to="/login" replace />;
  return (
    <AuthProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </AuthProvider>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'tracks', element: <TrackListPage /> },
      { path: 'engagements', element: <EngagementsPage /> },
      { path: 'interceptors', element: <InterceptorsPage /> },
      { path: 'audit', element: <AuditLogPage /> },
      { path: 'simulator', element: <SimulatorPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
