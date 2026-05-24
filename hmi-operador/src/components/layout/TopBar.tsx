import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Shield, LogOut, Settings as SettingsIcon, Activity, Radio, ClipboardList, Beaker } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

const NAV = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: Shield, hotkey: 'F3' },
  { to: '/tracks', labelKey: 'nav.tracks', icon: Activity, hotkey: 'F2' },
  { to: '/engagements', labelKey: 'nav.engagements', icon: Radio, hotkey: 'F4' },
  { to: '/interceptors', labelKey: 'nav.interceptors', icon: Radio, hotkey: '' },
  { to: '/audit', labelKey: 'nav.audit', icon: ClipboardList, hotkey: '' },
  { to: '/simulator', labelKey: 'nav.simulator', icon: Beaker, hotkey: '' },
];

export function TopBar(): JSX.Element {
  const { t } = useTranslation();
  const { operator, logout } = useAuth();

  return (
    <header
      className="flex items-center justify-between gap-4 border-b border-border bg-bg-panel px-4 h-14"
      role="banner"
    >
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="flex items-center gap-2 group">
          <Shield className="h-6 w-6 text-accent-cyan" aria-hidden />
          <div className="leading-tight">
            <p className="text-tactical-base font-bold uppercase tracking-wider text-text-primary">
              Cupula Celestial
            </p>
            <p className="text-tactical-xs text-text-muted font-mono">HMI Operador C2</p>
          </div>
        </Link>
      </div>

      <nav aria-label="Navegacion principal" className="flex items-center gap-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'px-3 py-1.5 rounded-md text-tactical-sm font-medium flex items-center gap-1.5 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan',
                isActive
                  ? 'bg-accent-cyan/15 text-accent-cyan'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
              )
            }
          >
            <item.icon className="h-4 w-4" aria-hidden />
            <span>{t(item.labelKey)}</span>
            {item.hotkey && <span className="text-tactical-xs opacity-60">{item.hotkey}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        {operator && (
          <div className="text-right leading-tight">
            <p className="text-tactical-sm text-text-primary font-mono">
              {operator.rank} {operator.display_name}
            </p>
            <div className="flex items-center gap-1 justify-end">
              <Badge variant="cyan" className="text-tactical-xs">
                {operator.role}
              </Badge>
              <Badge variant="outline" className="text-tactical-xs">
                {operator.unit}
              </Badge>
            </div>
          </div>
        )}
        <Link to="/settings" aria-label="Ajustes">
          <Button variant="ghost" size="icon">
            <SettingsIcon className="h-4 w-4" aria-hidden />
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void logout()}
          aria-label="Cerrar sesion (Ctrl+Shift+L)"
          data-testid="btn-logout"
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </header>
  );
}
