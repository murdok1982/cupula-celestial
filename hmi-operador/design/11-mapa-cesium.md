# 11 — Estilo del mapa Cesium

> El mapa es la **vista geoespacial primaria del operador**. Debe transmitir información táctica con jerarquía visual estricta: lo crítico (hostil + activo crítico amigo) domina; el contexto (terreno, imagery) acompaña.

---

## 1. Filosofía

- **Terreno oscuro de baja saturación** → no compite con tracks.
- **Imagery satélite atenuada al 50–60%** → contexto, no foco.
- **Tracks luminosos** → focales, con color de afiliación.
- **Geofences sutiles** → presentes pero no dominantes.
- **Sin labels excesivos** → solo lo crítico tiene texto sobre el mapa (otros datos en panel lateral).

---

## 2. Capas y estilos

### 2.1 Terreno base

```ts
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1B2330'); // tierra oscura
viewer.scene.globe.atmosphereLightIntensity = 0;     // sin glow atmósfera
viewer.scene.skyAtmosphere.show = false;             // sin halo azul cielo
viewer.scene.globe.showGroundAtmosphere = false;
viewer.scene.globe.enableLighting = false;           // sin sombras dinámicas
viewer.scene.fog.enabled = false;                    // sin niebla decorativa
```

- **Color tierra**: `#1B2330`
- **Color océano**: `#08111C`

### 2.2 Imagery aerial

Layer Bing Maps Aerial o equivalente con **opacidad 0.55** para que el terreno oscuro lo subraye:

```ts
const aerialLayer = viewer.imageryLayers.addImageryProvider(
  await Cesium.IonImageryProvider.fromAssetId(2) // Bing Aerial
);
aerialLayer.alpha = 0.55;
aerialLayer.brightness = 0.75;
aerialLayer.contrast = 1.1;
aerialLayer.saturation = 0.4;  // desaturación deliberada
```

**Razón táctica:** el aerial saturado distrae al ojo del track. La desaturación 60 % permite reconocer carreteras / edificaciones para contexto operativo sin convertirse en foco.

### 2.3 Capa de bordes administrativos

Opcional, opacidad 0.4:

```ts
viewer.dataSources.add(await Cesium.GeoJsonDataSource.load('/data/spain-admin.geojson', {
  stroke: Cesium.Color.fromCssColorString('#3D4A5C').withAlpha(0.6),
  fill: Cesium.Color.TRANSPARENT,
  strokeWidth: 1,
}));
```

---

## 3. Geofences

### 3.1 No-fire zone (civil — escuelas, hospitales, embajadas)

Color: **rojo carmín** outline + fill translúcido.

```ts
viewer.entities.add({
  polygon: {
    hierarchy: [...],
    material: Cesium.Color.fromCssColorString('#E5484D').withAlpha(0.08),
    outline: true,
    outlineColor: Cesium.Color.fromCssColorString('#E5484D').withAlpha(0.80),
    outlineWidth: 2,
    classificationType: Cesium.ClassificationType.TERRAIN,
  },
  label: {
    text: 'NO-FIRE: Hospital La Paz',
    font: '12px JetBrains Mono',
    fillColor: Cesium.Color.fromCssColorString('#E5484D'),
    outlineColor: Cesium.Color.fromCssColorString('#0A0E14'),
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    showBackground: true,
    backgroundColor: Cesium.Color.fromCssColorString('#11161D').withAlpha(0.85),
    pixelOffset: new Cesium.Cartesian2(0, -8),
  },
});
```

### 3.2 No-fly zone (corredor humanitario, espacio aéreo restringido civil)

Outline diagonal amarillo + fill amarillo muy suave:

```ts
material: Cesium.Color.fromCssColorString('#F3D03E').withAlpha(0.06),
outlineColor: Cesium.Color.fromCssColorString('#F3D03E').withAlpha(0.80),
```

### 3.3 Free-fire zone (zona militar autorizada)

Outline azul OTAN + fill azul muy suave:

```ts
material: Cesium.Color.fromCssColorString('#3E63DD').withAlpha(0.05),
outlineColor: Cesium.Color.fromCssColorString('#3E63DD').withAlpha(0.60),
```

---

## 4. Tracks (entidades dinámicas)

### 4.1 Estructura visual de un track

```
       Label (ID)              ← text-2xs JetBrains Mono, fill blanco, outline negro
       │
       [SVG APP-6 32px]        ← símbolo OTAN según SIDC
       │
       Halo (solo hostil)      ← pulse expandiendo desde 0 a 16px, color threat
       │
       Leader-line vector vel. ← gradient color threat → transparent
                                  longitud = velocidad × 1 minuto proyección
       │
       Trail histórico         ← polyline opacidad linealmente decreciente (8 últimas posiciones)
```

### 4.2 Implementación por clasificación

```ts
import { entityColors } from '../design/tokens/cesium-styles';

const baseProps = {
  billboard: {
    image: ms.Symbol(track.sidc, { size: 32 }).asCanvas(),
    scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.2, 1.5e7, 0.6),
    pixelOffset: new Cesium.Cartesian2(0, -16),
    heightReference: Cesium.HeightReference.NONE,
  },
  label: {
    text: track.id,
    font: '11px "JetBrains Mono"',
    fillColor: Cesium.Color.fromCssColorString('#E6EDF3'),
    outlineColor: Cesium.Color.fromCssColorString('#0A0E14'),
    outlineWidth: 2,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cesium.Cartesian2(0, 18),
    distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 500_000),
  },
};

if (track.classification === 'HOSTIL_CONFIRMADO') {
  // Añadir halo pulsante (custom Primitive con CallbackProperty)
  viewer.entities.add({
    ...baseProps,
    point: {
      pixelSize: new Cesium.CallbackProperty((time) => {
        const phase = ((Date.now() / 1500) % 1);
        return 6 + phase * 12;       // 6 → 18 px pulse
      }, false),
      color: Cesium.Color.fromCssColorString('#E5484D').withAlpha(0.3),
      outlineWidth: 0,
    },
  });
}
```

### 4.3 Leader-line de velocidad

Línea desde la posición actual hacia la posición proyectada en 60 s, con gradient:

```ts
viewer.entities.add({
  polyline: {
    positions: new Cesium.CallbackProperty(() => [
      track.currentPosition,
      track.projectedPosition(60), // 60s proyección
    ], false),
    material: new Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.15,
      color: Cesium.Color.fromCssColorString(colorByThreat(track.classification)),
    }),
    width: 2,
    arcType: Cesium.ArcType.NONE,
  },
});
```

### 4.4 Trail histórico

Polyline con segmentos de opacidad decreciente:

```ts
viewer.entities.add({
  polyline: {
    positions: track.historicalPositions.slice(-8), // últimas 8
    material: Cesium.Color.fromCssColorString(colorByThreat(track.classification)).withAlpha(0.4),
    width: 1.5,
  },
});
```

---

## 5. Interceptores propios

Estilo distinto del track amigo genérico para que el operador identifique sus propios efectores:

```ts
viewer.entities.add({
  position: interceptor.position,
  billboard: {
    image: ms.Symbol('SFAPMFQ--------', { size: 28, monoColor: '#4FB6D9' }).asCanvas(),
    pixelOffset: new Cesium.Cartesian2(0, -14),
  },
  label: {
    text: `${interceptor.id} ${interceptor.batteryPct}%`,
    font: '10px "JetBrains Mono"',
    fillColor: Cesium.Color.fromCssColorString('#4FB6D9'),
    outlineColor: Cesium.Color.fromCssColorString('#0A0E14'),
    outlineWidth: 2,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cesium.Cartesian2(0, 16),
  },
});
```

Color cyan (`#4FB6D9`) para distinguir interceptores **propios** de patrullas militares amigas (`#3E63DD`).

---

## 6. Sensores estáticos

Radares, estaciones EO/IR, jammers ubicados en suelo:

```ts
viewer.entities.add({
  position: sensor.position,
  billboard: {
    image: ms.Symbol('SFGPESS--------', { size: 24 }).asCanvas(),
  },
  ellipsoid: {
    // cobertura del sensor (cono / esfera de detección)
    radii: new Cesium.Cartesian3(sensor.rangeM, sensor.rangeM, sensor.maxAltitudeM),
    material: Cesium.Color.fromCssColorString('#3E63DD').withAlpha(0.05),
    outline: true,
    outlineColor: Cesium.Color.fromCssColorString('#3E63DD').withAlpha(0.30),
  },
});
```

---

## 7. Cámara y controles

### 7.1 Vista por defecto

```ts
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(
    -3.703790,    // Madrid centro como ejemplo
    40.416775,
    8000,         // altura en m
  ),
  orientation: {
    heading: 0,
    pitch: Cesium.Math.toRadians(-60), // perspectiva oblicua tactical
    roll: 0,
  },
});
```

### 7.2 Slew-to-cue

Cuando el operador presiona `S` con un track seleccionado:

```ts
viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(track.lon, track.lat, 3000),
  orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
  duration: 0.8, // 800 ms — única animación cesium >200ms permitida
});
```

### 7.3 Controles deshabilitados

- `viewer.scene.screenSpaceCameraController.enableTilt` = **true** (operador puede inclinar).
- Doble-click sobre entidad: **NO** ejecuta tracking automático (que oculta el control). Solo selecciona y muestra detalle en AuxPanel.
- Animations on lookAt: disabled.

---

## 8. Mini-radar (PPI — Plan Position Indicator)

Overlay en bottom-right del mapa Cesium. Vista 2D top-down circular tipo radar clásico.

```
┌──────────────────┐
│                  │
│        ●         │   ← cada ● es un track
│   ●        ●     │
│         N        │
│     W   ┼   E    │   ← rosa de los vientos
│         S        │
│   ●         ●    │
│        ●         │
│                  │
└──────────────────┘
  240 × 240 px, bg-surface/85, border 1px border-default
```

- Centro del radar: posición del operador / centro del área operativa.
- Radio configurable (1, 5, 10, 25, 50 km).
- Sweep visual lineal cada 4 s (opcional, desactivable — sin sweep si `prefers-reduced-motion`).
- Click en track del mini-radar: selecciona y centra mapa Cesium.

---

## 9. HUD de coordenadas cursor

Top-right del mapa Cesium:

```
┌────────────────────────────┐
│ Lat: 40.4168°N             │
│ Lon: -3.7038°W             │
│ Alt: 230 m AGL             │
│ Distancia: 1.2 km          │
└────────────────────────────┘
   font mono tabular, text-xs, padding space-2
   bg-surface/85, backdrop-blur-sm
```

Distancia se mide desde el track seleccionado al cursor (si hay selección activa).

---

## 10. Performance

- **Máximo 200 entidades visibles** simultáneamente en el mapa. Si > 200, se agrupan por proximidad con clustering (Cesium tiene API `EntityCluster`).
- **Polylines historicales limitadas a últimas 8 posiciones** por track.
- **WebGL antialiasing**: activado solo en monitor 4K+. En 1080 desactivado para FPS.

```ts
viewer.scene.fxaa = false;            // desactiva FXAA si no se necesita
viewer.scene.postProcessStages.fxaa.enabled = window.devicePixelRatio >= 2;
viewer.resolutionScale = 1.0;
viewer.targetFrameRate = 60;
```

---

## 11. Modo Night Vision (Cesium)

El mapa cambia a escala roja monocromática:

```ts
function applyNightVisionToCesium(viewer: Cesium.Viewer) {
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1A0606');
  viewer.imageryLayers.get(0).alpha = 0.20;             // imagery muy atenuada
  viewer.imageryLayers.get(0).saturation = 0;            // a B/N
  viewer.imageryLayers.get(0).hue = 0;                   // sin manipular hue, basta saturación
  // Aplicar postprocess shader monocromo rojo
  const stages = viewer.scene.postProcessStages;
  const redMonoShader = new Cesium.PostProcessStage({
    fragmentShader: `
      uniform sampler2D colorTexture;
      varying vec2 v_textureCoordinates;
      void main() {
        vec4 c = texture2D(colorTexture, v_textureCoordinates);
        float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor = vec4(lum, lum * 0.1, lum * 0.1, c.a);
      }
    `,
  });
  stages.add(redMonoShader);
}
```

---

## 12. Exportación de tokens

Ver `tokens/cesium-styles.ts` con todos estos colores y configuraciones tipados.
