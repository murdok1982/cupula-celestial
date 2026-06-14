import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Viewer,
  Ion,
  Cartesian3,
  Cartesian2,
  Color,
  ConstantProperty,
  ConstantPositionProperty,
  HeightReference,
  LabelStyle,
  VerticalOrigin,
  HorizontalOrigin,
  PolylineGlowMaterialProperty,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  ArcType,
  DistanceDisplayCondition,
  NearFarScalar,
  type Entity,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { env } from '@/env';
import { useTrackStore } from '@/store/trackStore';
import { useInterceptorStore, selectActiveInterceptors } from '@/store/interceptorStore';
import { useMapStore } from './useMapStore';
import { natoSymbolDataUrl } from '@/lib/nato-symbology';
import { threatRgba } from '@/lib/threat';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layers, Eye, EyeOff } from 'lucide-react';


const HOME_LON = -3.7038;
const HOME_LAT = 40.4168;
const HOME_ALT = 6000;

const GEOFENCES: ReadonlyArray<{ name: string; lat: number; lon: number; radius_m: number }> = [
  { name: 'Hospital La Paz', lat: 40.4769, lon: -3.6919, radius_m: 400 },
  { name: 'Embajada USA', lat: 40.4351, lon: -3.6877, radius_m: 300 },
  { name: 'IES San Isidro', lat: 40.4087, lon: -3.7102, radius_m: 250 },
];

interface LayerVisibility {
  tracks: boolean;
  geofences: boolean;
  interceptors: boolean;
  weather: boolean;
  airspace: boolean;
}

export function CesiumMap(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const trackEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const leaderLineEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const interceptorEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const engagementLineEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const geofenceEntitiesRef = useRef<Entity[]>([]);
  const minimapViewerRef = useRef<Viewer | null>(null);
  const minimapContainerRef = useRef<HTMLDivElement>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layers, setLayers] = useState<LayerVisibility>({
    tracks: true,
    geofences: true,
    interceptors: true,
    weather: false,
    airspace: false,
  });

  const toggleLayer = useCallback((key: keyof LayerVisibility) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Init Cesium
  useEffect(() => {
    if (!containerRef.current) return;
    if (env.VITE_CESIUM_ION_TOKEN) {
      Ion.defaultAccessToken = env.VITE_CESIUM_ION_TOKEN;
    }

    const viewer = new Viewer(containerRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: true,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
      shouldAnimate: true,
      requestRenderMode: true,
      maximumRenderTimeChange: Number.POSITIVE_INFINITY,
    });

    viewer.scene.globe.enableLighting = false;
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
    viewer.scene.backgroundColor = Color.fromCssColorString('#0a0e14');
    viewer.scene.globe.baseColor = Color.fromCssColorString('#1a2332');

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(HOME_LON, HOME_LAT, HOME_ALT),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-45), roll: 0 },
      duration: 0,
    });

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position) as { id?: { id?: string } } | undefined;
      const id = picked?.id?.id;
      if (typeof id === 'string' && id.startsWith('T-')) {
        useTrackStore.getState().selectTrack(id);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position) as { id?: { id?: string } } | undefined;
      const id = picked?.id?.id;
      if (typeof id === 'string' && id.startsWith('T-')) {
        useMapStore.getState().slewTo(id);
      }
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    viewerRef.current = viewer;

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
      trackEntitiesRef.current.clear();
      leaderLineEntitiesRef.current.clear();
      interceptorEntitiesRef.current.clear();
      engagementLineEntitiesRef.current.clear();
      geofenceEntitiesRef.current = [];
    };
  }, []);

  // Minimap (small overview in bottom right)
  useEffect(() => {
    if (!minimapContainerRef.current) return;
    const minimap = new Viewer(minimapContainerRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
      shouldAnimate: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Number.POSITIVE_INFINITY,
    });
    if (minimap.scene.skyBox) minimap.scene.skyBox.show = false;
    minimap.scene.backgroundColor = Color.fromCssColorString('#0a0e14');
    minimap.scene.globe.baseColor = Color.fromCssColorString('#1a2332');
    minimap.scene.morphTo2D(0);

    minimapViewerRef.current = minimap;

    // Sync minimap camera with main viewer
    const mainViewer = viewerRef.current;
    if (mainViewer) {
      const syncCamera = () => {
        const cam = mainViewer.camera;
        const pos = cam.positionWC;
        const dir = cam.directionWC;
        minimap.camera.setView({
          destination: pos,
          orientation: { direction: dir, up: cam.upWC },
        });
        minimap.scene.requestRender();
      };
      mainViewer.camera.changed.addEventListener(syncCamera);
      return () => {
        mainViewer.camera.changed.removeEventListener(syncCamera);
        minimap.destroy();
        minimapViewerRef.current = null;
      };
    }
    return () => {
      minimap.destroy();
      minimapViewerRef.current = null;
    };
  }, []);

  // Geofences
  useEffect(() => {
    function applyGeofences(show: boolean): void {
      const viewer = viewerRef.current;
      if (!viewer) return;
      for (const e of geofenceEntitiesRef.current) viewer.entities.remove(e);
      geofenceEntitiesRef.current = [];
      if (!show) { viewer.scene.requestRender(); return; }
      for (const gf of GEOFENCES) {
        const ent = viewer.entities.add({
          name: `GEOFENCE-${gf.name}`,
          position: Cartesian3.fromDegrees(gf.lon, gf.lat, 0),
          ellipse: {
            semiMajorAxis: gf.radius_m,
            semiMinorAxis: gf.radius_m,
            material: Color.fromCssColorString('#ff3838').withAlpha(0.15),
            outline: true,
            outlineColor: Color.fromCssColorString('#ff3838').withAlpha(0.7),
            outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: `NO-FLY: ${gf.name}`,
            font: '10px monospace',
            fillColor: Color.fromCssColorString('#ff3838'),
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.BOTTOM,
            horizontalOrigin: HorizontalOrigin.CENTER,
            pixelOffset: new Cartesian2(0, -8),
          },
        });
        geofenceEntitiesRef.current.push(ent);
      }
      viewer.scene.requestRender();
    }
    applyGeofences(layers.geofences);
    const unsub = useMapStore.subscribe((state) => applyGeofences(state.showGeofences));
    return () => unsub();
  }, [layers.geofences]);

  // Sync tracks with store + dynamic labels distance fade
  useEffect(() => {
    function syncTracks(): void {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const state = useTrackStore.getState();
      const mapState = useMapStore.getState();
      const tracks = Object.values(state.tracks);
      const existingIds = new Set(trackEntitiesRef.current.keys());
      const showTracks = layers.tracks;
      const showLeaders = mapState.showLeaderLines && showTracks;

      for (const t of tracks) {
        if (!showTracks) {
          const existing = trackEntitiesRef.current.get(t.track_id);
          if (existing) {
            existing.show = false;
            const ll = leaderLineEntitiesRef.current.get(`${t.track_id}-LL`);
            if (ll) ll.show = false;
          }
          continue;
        }

        existingIds.delete(t.track_id);
        const pos = Cartesian3.fromDegrees(t.position.lon, t.position.lat, t.position.alt_m);
        const rgba = threatRgba(t.classification);
        const color = new Color(rgba[0], rgba[1], rgba[2], rgba[3]);
        const billboardImg = natoSymbolDataUrl(t.classification, 36);
        const labelText = `${t.track_id}\n${t.classification}`;
        const ent = trackEntitiesRef.current.get(t.track_id);

        // Distance display condition: fade labels between 5km and 50km
        const distDisplay = new DistanceDisplayCondition(0, 50000);
        const nearFar = new NearFarScalar(5000, 1.0, 50000, 0.0);

        if (ent) {
          ent.position = new ConstantPositionProperty(pos);
          ent.show = true;
          if (ent.billboard) {
            ent.billboard.image = new ConstantProperty(billboardImg);
            ent.billboard.distanceDisplayCondition = new ConstantProperty(distDisplay);
            ent.billboard.translucencyByDistance = new ConstantProperty(nearFar);
          }
          if (ent.label) {
            ent.label.text = new ConstantProperty(labelText);
            ent.label.distanceDisplayCondition = new ConstantProperty(distDisplay);
            ent.label.translucencyByDistance = new ConstantProperty(nearFar);
          }
        } else {
          const created = viewer.entities.add({
            id: t.track_id,
            name: t.track_id,
            position: pos,
            billboard: {
              image: billboardImg,
              verticalOrigin: VerticalOrigin.CENTER,
              horizontalOrigin: HorizontalOrigin.CENTER,
              scale: 1.0,
              distanceDisplayCondition: distDisplay,
              translucencyByDistance: nearFar,
            },
            label: {
              text: labelText,
              font: 'bold 11px monospace',
              fillColor: color,
              outlineColor: Color.BLACK,
              outlineWidth: 2,
              style: LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: VerticalOrigin.TOP,
              horizontalOrigin: HorizontalOrigin.LEFT,
              pixelOffset: new Cartesian2(14, 0),
              showBackground: true,
              backgroundColor: Color.fromCssColorString('#0a0e14').withAlpha(0.7),
              distanceDisplayCondition: distDisplay,
              translucencyByDistance: nearFar,
            },
          });
          trackEntitiesRef.current.set(t.track_id, created);
        }

        // Leader line projection with decreasing opacity
        if (showLeaders) {
          const steps = 5;
          const stepDuration = 6;
          for (let i = 0; i < steps; i++) {
            const sec = (i + 1) * stepDuration;
            const projLat = t.position.lat + (t.velocity.vy_ms * sec) / 111_320;
            const projLon =
              t.position.lon +
              (t.velocity.vx_ms * sec) / (111_320 * Math.cos((t.position.lat * Math.PI) / 180));
            const projAlt = Math.max(0, t.position.alt_m + t.velocity.vz_ms * sec);
            const llId = `${t.track_id}-LL-${i}`;
            const llEnt = leaderLineEntitiesRef.current.get(llId);
            const opacity = 1.0 - i * 0.15;
            const lineColor = color.withAlpha(Math.max(0.1, opacity));
            const startPos = i === 0
              ? pos
              : Cartesian3.fromDegrees(
                  t.position.lon +
                    (t.velocity.vx_ms * i * stepDuration) /
                      (111_320 * Math.cos((t.position.lat * Math.PI) / 180)),
                  t.position.lat + (t.velocity.vy_ms * i * stepDuration) / 111_320,
                  Math.max(0, t.position.alt_m + t.velocity.vz_ms * i * stepDuration),
                );
            const endPos = Cartesian3.fromDegrees(projLon, projLat, projAlt);
            const positions = [startPos, endPos];

            if (llEnt && llEnt.polyline) {
              llEnt.polyline.positions = new ConstantProperty(positions);
              llEnt.show = true;
              ((llEnt.polyline.material as PolylineGlowMaterialProperty).color as unknown as { setValue(v: Color): void })?.setValue(lineColor);
            } else {
              const created = viewer.entities.add({
                id: llId,
                show: true,
                polyline: {
                  positions,
                  width: Math.max(0.5, 2 - i * 0.3),
                  material: new PolylineGlowMaterialProperty({
                    color: lineColor,
                    glowPower: 0.2 - i * 0.03,
                    taperPower: 1.0,
                  }),
                  arcType: ArcType.GEODESIC,
                },
              });
              leaderLineEntitiesRef.current.set(llId, created);
            }
          }
        } else {
          // Hide all leader lines for this track
          for (let i = 0; i < 5; i++) {
            const ll = leaderLineEntitiesRef.current.get(`${t.track_id}-LL-${i}`);
            if (ll) ll.show = false;
          }
        }
      }

      // Remove gone tracks
      for (const goneId of existingIds) {
        const ent = trackEntitiesRef.current.get(goneId);
        if (ent) viewer.entities.remove(ent);
        trackEntitiesRef.current.delete(goneId);
        for (let i = 0; i < 5; i++) {
          const ll = leaderLineEntitiesRef.current.get(`${goneId}-LL-${i}`);
          if (ll) {
            viewer.entities.remove(ll);
            leaderLineEntitiesRef.current.delete(`${goneId}-LL-${i}`);
          }
        }
      }

      viewer.scene.requestRender();
    }

    syncTracks();
    const unsubTracks = useTrackStore.subscribe(syncTracks);
    const unsubMap = useMapStore.subscribe(syncTracks);
    return () => { unsubTracks(); unsubMap(); };
  }, [layers.tracks]);

  // Sync interceptors with store
  useEffect(() => {
    function syncInterceptors(): void {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const activeInterceptors = selectActiveInterceptors(useInterceptorStore.getState());
      const existingIds = new Set(interceptorEntitiesRef.current.keys());
      const showInterceptors = layers.interceptors;
      const showEngagementLines = showInterceptors;

      const friendBillboard = natoSymbolDataUrl('MILITAR_AMIGO', 32);
      const interceptorColor = new Color(0.31, 0.73, 1.0, 0.95);

      for (const i of activeInterceptors) {
        if (!showInterceptors) {
          const existing = interceptorEntitiesRef.current.get(i.interceptor_id);
          if (existing) existing.show = false;
          const el = engagementLineEntitiesRef.current.get(`${i.interceptor_id}-EL`);
          if (el) el.show = false;
          continue;
        }

        existingIds.delete(i.interceptor_id);
        const pos = Cartesian3.fromDegrees(i.position.lon, i.position.lat, i.position.alt_m);
        const statusLabel = i.status === 'CRUISE' ? 'CRT' : i.status === 'TERMINAL' ? 'TRM' : i.status === 'LAUNCH' ? 'LCH' : i.status === 'RTB' ? 'RTB' : i.status === 'READY' ? 'RDY' : i.status.substring(0, 3);
        const labelText = `${i.interceptor_id}\n${statusLabel}`;
        const ent = interceptorEntitiesRef.current.get(i.interceptor_id);

        if (ent) {
          ent.position = new ConstantPositionProperty(pos);
          ent.show = true;
          if (ent.billboard) {
            ent.billboard.rotation = new ConstantProperty(
              CesiumMath.toRadians(-i.telemetry.heading_deg),
            );
          }
          if (ent.label) {
            ent.label.text = new ConstantProperty(labelText);
          }
        } else {
          const created = viewer.entities.add({
            id: i.interceptor_id,
            name: i.interceptor_id,
            position: pos,
            billboard: {
              image: friendBillboard,
              verticalOrigin: VerticalOrigin.CENTER,
              horizontalOrigin: HorizontalOrigin.CENTER,
              scale: 0.85,
              rotation: CesiumMath.toRadians(-i.telemetry.heading_deg),
              color: interceptorColor,
            },
            label: {
              text: labelText,
              font: 'bold 10px monospace',
              fillColor: Color.fromCssColorString('#4a9eff'),
              outlineColor: Color.BLACK,
              outlineWidth: 2,
              style: LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: VerticalOrigin.TOP,
              horizontalOrigin: HorizontalOrigin.LEFT,
              pixelOffset: new Cartesian2(12, 0),
              showBackground: true,
              backgroundColor: Color.fromCssColorString('#0a0e14').withAlpha(0.7),
            },
          });
          interceptorEntitiesRef.current.set(i.interceptor_id, created);
        }

        if (showEngagementLines && i.assigned_track_id) {
          const targetTrack = useTrackStore.getState().tracks[i.assigned_track_id];
          if (targetTrack) {
            const targetPos = Cartesian3.fromDegrees(
              targetTrack.position.lon,
              targetTrack.position.lat,
              targetTrack.position.alt_m,
            );
            const elId = `${i.interceptor_id}-EL`;
            const elEnt = engagementLineEntitiesRef.current.get(elId);
            const lineColor = Color.fromCssColorString('#4a9eff').withAlpha(0.6);

            if (elEnt && elEnt.polyline) {
              elEnt.polyline.positions = new ConstantProperty([pos, targetPos]);
              elEnt.show = true;
            } else {
              const created = viewer.entities.add({
                id: elId,
                show: true,
                polyline: {
                  positions: [pos, targetPos],
                  width: 1.5,
                  material: new PolylineGlowMaterialProperty({
                    color: lineColor,
                    glowPower: 0.15,
                    taperPower: 1.0,
                  }),
                  arcType: ArcType.GEODESIC,
                },
              });
              engagementLineEntitiesRef.current.set(elId, created);
            }
          }
        } else {
          const el = engagementLineEntitiesRef.current.get(`${i.interceptor_id}-EL`);
          if (el) el.show = false;
        }
      }

      for (const goneId of existingIds) {
        const ent = interceptorEntitiesRef.current.get(goneId);
        if (ent) viewer.entities.remove(ent);
        interceptorEntitiesRef.current.delete(goneId);
        const el = engagementLineEntitiesRef.current.get(`${goneId}-EL`);
        if (el) {
          viewer.entities.remove(el);
          engagementLineEntitiesRef.current.delete(`${goneId}-EL`);
        }
      }

      viewer.scene.requestRender();
    }

    syncInterceptors();
    const unsubInterceptors = useInterceptorStore.subscribe(syncInterceptors);
    const unsubTracks = useTrackStore.subscribe(syncInterceptors);
    const unsubMap = useMapStore.subscribe(syncInterceptors);
    return () => { unsubInterceptors(); unsubTracks(); unsubMap(); };
  }, [layers.interceptors]);

  // Slew-to-cue
  useEffect(() => {
    const unsub = useMapStore.subscribe((state) => {
      const viewer = viewerRef.current;
      if (!viewer || !state.slewToCueTrackId) return;
      const t = useTrackStore.getState().tracks[state.slewToCueTrackId];
      if (!t) return;
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(t.position.lon, t.position.lat, t.position.alt_m + 4000),
        orientation: { heading: 0, pitch: CesiumMath.toRadians(-45), roll: 0 },
        duration: 1.5,
      });
      useMapStore.getState().slewTo(null);
    });
    return () => unsub();
  }, []);

  return (
    <div className="w-full h-full min-h-[400px] relative bg-bg-base">
      <div
        ref={containerRef}
        className="w-full h-full"
        role="application"
        aria-label="Mapa 3D tactico de Cupula Celestial"
        data-testid="cesium-map"
      />
      {/* Minimap */}
      <div
        ref={minimapContainerRef}
        className="absolute bottom-4 right-4 w-48 h-36 border border-border rounded overflow-hidden shadow-tactical z-10 pointer-events-none"
        aria-label="Minimapa de navegacion"
      />
      {/* Layer selector */}
      <div className="absolute top-4 right-4 z-20">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLayersOpen(!layersOpen)}
          className="bg-bg-panel/90 backdrop-blur-sm"
          aria-label="Selector de capas"
          data-testid="layer-selector-btn"
        >
          <Layers className="h-3.5 w-3.5 mr-1" aria-hidden />
          Capas
        </Button>
        {layersOpen && (
          <Card className="absolute top-10 right-0 w-48 p-2 space-y-1 z-30">
            {(Object.keys(layers) as Array<keyof LayerVisibility>).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => toggleLayer(k)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-tactical-xs font-mono text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors"
                aria-pressed={layers[k]}
              >
                {layers[k] ? (
                  <Eye className="h-3 w-3 text-accent-cyan" />
                ) : (
                  <EyeOff className="h-3 w-3 text-text-muted" />
                )}
                <span className="capitalize">{k}</span>
              </button>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
