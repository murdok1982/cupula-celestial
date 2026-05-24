# 05 — Sensores y fusión multisensor

## Matriz de sensores

| Sensor | Alcance típico | Pd UAS Clase I | Pros | Contras |
|--------|---------------|----------------|------|---------|
| Radar AESA banda X (Ku) | 3–10 km | 0,8–0,95 | Todo tiempo, micro-Doppler | Caro, RCS bajo es difícil |
| Radar pasivo (PCL) | 5–20 km | 0,6–0,8 | LPI/LPD, no emite | Depende de iluminadores |
| RF spectrum sensing | 2–8 km | 0,7–0,9 según firma | Detecta C2 enemigo | UAS sin radio no detectables |
| EO/IR gimbal (MWIR) | 1–4 km | 0,9 con cue | Identificación visual | Meteo, día/noche |
| Acústica array | 100–800 m | 0,7–0,85 | Cobertura urbana | Ruido ambiente |
| LIDAR | 200–500 m | 0,9 | 3D preciso | Caro, alcance corto |
| Satélite EO/SAR LEO | regional | 0,3–0,5 | Strategic warning | Latencia, revisita |
| ADS-B / Remote ID | dependiente | 1,0 (cooperativo) | Identificación amigos | UAS hostiles no transmiten |

## Sensor primario propuesto: Radar AESA banda X

- 32–64 elementos T/R, GaN
- PRF agile, waveform LFM + Barker
- Procesado micro-Doppler para discriminar rotores
- Productores nacionales: **Indra** (LANZA, ARIES), **Tecnobit**.

## RF spectrum sensing

Análisis pasivo del espectro 433/868/915 MHz, 2,4 GHz, 5,8 GHz, banda L
satelital, en busca de firmas de telemetría conocidas (DJI OcuSync, ELRS,
TBS Crossfire, Skydroid, modelos rusos/iraníes documentados).

Hardware: SDR Ettus USRP X410 o RFNoC USRP B210 en nodos económicos.
Software: GNU Radio + clasificador CNN sobre espectrograma.

## Fusión: el núcleo matemático

### Modelo de pista

Estado: `x = [px, py, pz, vx, vy, vz, ax, ay, az, class_id]`

Filtro IMM con 3 modelos cinemáticos. Matriz de transición Markov de modos
ajustable según comportamiento observado.

### Asociación

Para K mediciones y N pistas, matriz de coste de asociación basada en:

```
c_ki = d_Mahalanobis(z_k, ẑ_i) + λ_class·(1 − sim_class) + λ_iff·iff_mismatch
```

Resolución: Auction algorithm para tiempo real (<10 ms para 100 pistas).

### Detección de track confirmation

Regla M/N: una pista candidato se confirma tras `M` asociaciones en `N` ciclos
de actualización (ej. 3/5). Reduce ghost tracks.

### Out-of-sequence measurements

Las mediciones de sensores con latencias distintas (satélite vs radar local)
llegan desordenadas. Se gestionan con backward prediction o forward retrodiction.

## Geo-referencia y datums

- WGS-84 / UTM para posición.
- MSL y AGL diferenciados (vital para UAS que vuelan bajo).
- Modelo digital de terreno (LIDAR PNOA, MDT a 2 m).
- Modelo de obstáculos urbanos (cartografía catastral + OSM enriquecido).

## Salida del subsistema de fusión

Stream gRPC de mensajes `Track` (Protobuf):

```proto
message Track {
  string track_id = 1;
  google.protobuf.Timestamp timestamp = 2;
  Position position = 3;            // ECEF + WGS84 + AGL
  Velocity velocity = 4;
  CovarianceMatrix uncertainty = 5;
  ThreatClass classification = 6;
  float classification_confidence = 7;
  repeated SensorContribution sources = 8;  // qué sensores aportan
  IFFStatus iff = 9;
  KinematicProfile profile = 10;    // ala fija / ala rotatoria / balístico
}
```

Publicado a Kafka topic `tracks.confirmed` (consumido por decision-engine y HMI).
