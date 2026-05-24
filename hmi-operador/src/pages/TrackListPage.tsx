import { useTracks } from '@/hooks/useTracks';
import { useTrackStore } from '@/store/trackStore';
import { useSelectedTrack } from '@/hooks/useTracks';
import { TrackRow } from '@/components/tactical/TrackRow';
import { TrackDetailsPanel } from '@/components/tactical/TrackDetailsPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

export function TrackListPage(): JSX.Element {
  const tracks = useTracks();
  const selected = useSelectedTrack();

  return (
    <div className="flex-1 grid grid-cols-[1fr_400px] gap-3 p-3 overflow-hidden">
      <Card className="flex flex-col overflow-hidden">
        <CardHeader>
          <CardTitle>Pistas activas ({tracks.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <ul aria-label="Lista detallada de pistas" className="divide-y divide-border">
              {tracks.map((track) => (
                <li key={track.track_id}>
                  <TrackRow
                    track={track}
                    selected={selected?.track_id === track.track_id}
                    onSelect={(id) => useTrackStore.getState().selectTrack(id)}
                  />
                </li>
              ))}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>
      <div>
        <TrackDetailsPanel track={selected} />
      </div>
    </div>
  );
}
