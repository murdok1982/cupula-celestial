import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from './TopBar';
import { StatusBar } from './StatusBar';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useAuth } from '@/auth/useAuth';
import { useOperatorStore } from '@/store/operatorStore';
import { cn } from '@/lib/cn';

interface Props {
  children: ReactNode;
}

export function AppShell({ children }: Props): JSX.Element {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const displayMode = useOperatorStore((s) => s.displayMode);
  const fontScale = useOperatorStore((s) => s.fontScale);
  const emergencyMode = useOperatorStore((s) => s.emergencyMode);

  useWebSocket();

  useHotkeys([
    { combo: 'F1', handler: () => navigate('/settings') },
    { combo: 'F2', handler: () => navigate('/tracks') },
    { combo: 'F3', handler: () => navigate('/dashboard') },
    { combo: 'F4', handler: () => navigate('/engagements') },
    { combo: 'Ctrl+Shift+L', handler: () => void logout(), global: true },
    {
      combo: 'Ctrl+Shift+N',
      handler: () => {
        const cur = useOperatorStore.getState().displayMode;
        useOperatorStore.getState().setDisplayMode(cur === 'night' ? 'tactical' : 'night');
      },
      global: true,
    },
  ]);

  return (
    <div
      className={cn(
        'flex flex-col min-h-screen w-full bg-bg-base',
        displayMode === 'night' && 'night-mode',
        displayMode === 'colorblind' && 'colorblind-mode',
        emergencyMode && 'emergency-mode',
      )}
      style={{ fontSize: `${fontScale * 100}%` }}
      data-display-mode={displayMode}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-accent-cyan focus:text-bg-base focus:px-3 focus:py-1 focus:rounded"
      >
        Saltar al contenido principal
      </a>
      <TopBar />
      <main id="main" className="flex-1 overflow-hidden flex" role="main">
        {children}
      </main>
      <StatusBar />
    </div>
  );
}
