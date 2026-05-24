import { useMapStore } from './useMapStore';
import { Button } from '@/components/ui/button';
import { GeofenceLayerToggle } from './GeofenceLayer';
import { useTrackStore } from '@/store/trackStore';
import { Eye, EyeOff, Target } from 'lucide-react';

export function MapControls(): JSX.Element {
  const leader = useMapStore((s) => s.showLeaderLines);
  const toggleLeader = useMapStore((s) => s.toggleLeaderLines);
  const slewTo = useMapStore((s) => s.slewTo);
  const selectedTrackId = useTrackStore((s) => s.selectedTrackId);

  return (
    <div
      className="absolute top-3 right-3 z-10 flex flex-col gap-2 bg-bg-panel/85 backdrop-blur p-2 rounded-md border border-border"
      role="toolbar"
      aria-label="Controles del mapa"
    >
      <GeofenceLayerToggle />
      <Button
        variant={leader ? 'tactical' : 'outline'}
        size="sm"
        onClick={toggleLeader}
        aria-pressed={leader}
        data-testid="toggle-leader-lines"
      >
        {leader ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
        Leader lines
      </Button>
      <Button
        variant="tactical"
        size="sm"
        disabled={!selectedTrackId}
        onClick={() => selectedTrackId && slewTo(selectedTrackId)}
        data-testid="btn-slew-to-cue"
      >
        <Target className="h-4 w-4" aria-hidden />
        Slew-to-Cue
      </Button>
    </div>
  );
}
