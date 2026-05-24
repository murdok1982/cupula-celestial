# 10 — Hardware: BOM y plataforma física

## Dron interceptor — clase "AVISPA" (concepto)

Configuración propuesta para PoC:

| Componente | Modelo / Spec | Coste unitario | Notas |
|------------|---------------|----------------|-------|
| Frame | Carbono pultrusionado, 350 mm diagonal | ~80 € | Producción Indra / FACC España |
| Motores | T-Motor F90 / similar, 4 unid. | ~120 € | 4×30 € |
| ESCs | BLHeli32 50A 4-en-1 | ~60 € | |
| Hélices | Tri-pala 7" carbono, recambios | ~10 € | Consumible |
| Batería | LiPo 6S 5000 mAh + LiHV redundancia | ~70 € | Autonomía 18–22 min loiter |
| **Cómputo IA** | NVIDIA Jetson Orin Nano 8GB SoM + carrier | ~500 € | Cuello clave del coste |
| Cámara EO | Sony IMX678 8MP global shutter + lente 25 mm | ~180 € | Estabilizada por SW |
| Cámara IR (opc.) | Lepton 3.5 / FLIR Boson | ~600 € | Solo en variante nocturna |
| IMU | Bosch BMI088 + redundancia VectorNav | ~250 € | Grado táctico |
| GPS | u-blox ZED-F9P RTK + antena CRPA | ~200 € | Anti-jamming |
| Magnetómetro | RM3100 (PNI Sensor) | ~30 € | Inmune a EMI |
| Barómetro | MS5611 doble | ~10 € | |
| Radio | Doodle Labs Helix / silvus StreamCaster lite o radio SDR propio | ~700 € | LPI/LPD, mesh MANET |
| HSM | ATECC608B + módulo CC EAL4+ | ~80 € | Almacén de claves |
| FC (flight controller) | Custom PX4 sobre Pixhawk 6X o STM32H7 propio | ~250 € | |
| Carga útil (variante kinetic) | Punta de impacto + sistema de armado | ~60 € | |
| Estructura, cableado, tornillería | — | ~150 € | |
| Calibración, ensayo, certificación | — | ~500 € (amortizado por lote) | |
| **TOTAL estimado por unidad** | | **~3.850 € (kinetic)** / ~4.450 € (IR/explosivo) | Objetivo industrial: **<8.000 €** llave en mano incl. soporte y munición. |

**Producción objetivo en serie:** lote inicial 200 unidades, escalable a 2.000/año.

## Variantes operativas

- **AVISPA-K (kinetic)** — interceptor ramming, sin explosivo.
- **AVISPA-N (net)** — red de captura, no letal, recupera el UAV enemigo.
- **AVISPA-F (frag)** — espoleta de proximidad + carga 100 g, contra Shahed.
- **AVISPA-J (jammer)** — payload EW, no cinético.
- **AVISPA-S (scout)** — sin carga letal, sólo ISR, prolonga loiter a 60 min.

## Nodo sensor (radar AESA)

| Componente | Spec |
|------------|------|
| Antena AESA | 32×32 elementos GaN banda X (9,4 GHz) |
| Procesado | FPGA Xilinx Versal + GPU NVIDIA RTX A2000 |
| Cómputo edge | Jetson AGX Orin 64GB |
| Energía | 3,5 kW con UPS y respaldo diésel |
| Movilidad | Trailer remolcable + autonivelado |
| Productor | Indra (LANZA derivada) o desarrollo propio |
| Coste estimado | 250.000–600.000 € por unidad |

## Servidor del orquestador C2

**Rack 42U ruggerizado (estación fija):**
- 3 × servidor HPE ProLiant DL380 Gen11 / Dell PowerEdge R760
  - 2× Intel Xeon Platinum 8480+ (56C/112T)
  - 512 GB DDR5 ECC
  - 4× NVIDIA L40S (48 GB) para inferencia LLM/VLM
  - Almacenamiento: 8× NVMe 7,68 TB en RAID 6
- 2 × switch core 100 GbE (Aruba CX 8400 / Mellanox SN4600)
- UPS 30 kVA + generador diésel 50 kVA
- HSM en red (Thales Luna T-Series, certificado FIPS 140-3 Nivel 3)

**Variante móvil (contenedor ISO 20'):**
- Misma topología en factor de forma reducido (~2/3 capacidad).

## HMI Operador

- 2× monitores 4K (27" o 32"), uno principal otro feeds vídeo.
- Workstation Dell Precision con GPU Quadro RTX A5500.
- Teclado y ratón mil-spec MIL-STD-461G.
- Lector huellas biométrico FIPS 201.
- Token FIDO2 personal por operador.
- Sala con jaula de Faraday opcional.

## Resumen de coste PoC (24 meses)

| Capítulo | Coste |
|----------|-------|
| Personal (45 FTEs durante 24 meses) | ~12 M€ |
| Hardware C2 + 4 radares + 24 drones | ~6 M€ |
| Licencias software, herramientas, simuladores | ~1,5 M€ |
| Ensayos en INTA El Arenosillo + Bardenas | ~3 M€ |
| Certificación (DGAM, CCN, ANS-D) | ~1 M€ |
| Gestión, gastos generales, contingencia 15 % | ~3,5 M€ |
| **Total PoC** | **~27 M€** |

Producción inicial (200 drones + 8 radares + 4 nodos C2): ~50 M€ adicionales.
Coste total programa 24 meses + producción inicial: **~80 M€**.

## Soberanía industrial

- Indra: radar, comunicaciones, integración.
- GMV: software embarcado, geoespacial, satélite.
- Escribano M&E: gimbal EO/IR.
- Tecnobit-Grupo Oesía: aviónica, electrónica embarcada.
- INTA: ensayos, integración, certificación.
- ITP Aero / SENER: componentes mecánicos.
- Universidades: UPM (visión por computador), UPC (radar), UPV/EHU (criptografía).
- PYMEs nacionales para fabricación de frames, hélices, baterías.

Reparto sugerido para evitar dependencia única: 60 % Indra/grandes, 25 % PYMEs,
15 % universidades + CCN/CSIC.
