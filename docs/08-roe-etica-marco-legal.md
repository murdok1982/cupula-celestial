# 08 — ROE, ética y marco legal

Este documento es el **gate ético-jurídico** que toda la ingeniería debe respetar.
Las decisiones técnicas se subordinan a estos principios.

## Principios rectores

1. **Principio de distinción** (DIH, Protocolo Adicional I, art. 48) — el sistema
   debe distinguir combatientes/objetos militares de civiles y bienes civiles.
2. **Principio de proporcionalidad** (PAI, art. 51.5.b) — daño colateral
   esperado proporcional a la ventaja militar concreta y directa.
3. **Principio de precaución** (PAI, art. 57) — todas las medidas factibles
   para evitar o reducir daños incidentales.
4. **Meaningful Human Control (MHC)** — concepto emergente OTAN/UE/ONU sobre
   armas autónomas. Un humano cualificado debe (a) entender el sistema,
   (b) tener intención sobre el uso, (c) poder revocar la acción.
5. **Trazabilidad** — toda decisión letal debe poder auditarse y atribuirse.

## Niveles de autonomía implementados

Inspirado en SAE J3016 (driving automation) adaptado a sistemas de armas:

| Nivel | Descripción | ¿Aplica? |
|-------|-------------|----------|
| L0 | Sólo asistencia (alerta) | Siempre disponible |
| L1 | Sugerencia con confirmación humana ítem a ítem | **Nivel por defecto** |
| L2 | Pre-autorización geocercada de engagements en zonas vetadas a civiles | Disponible bajo ROE específica |
| L3 | Engagement automático tras vector cinético confirmado contra activo | **Reservado a casos extremos** |
| L4 | Autonomía letal sin humano | **PROHIBIDO** |

El sistema **nunca opera en L4**. La opción no existe en el firmware.

## Reglas de Enfrentamiento (ROE) parametrizables

Lenguaje declarativo tipo policy-as-code (Rego/OPA o lenguaje DSL propio):

```rego
package roe.dronedefense

default engagement_authorized = false

engagement_authorized {
  input.target.classification == "HOSTIL_CONFIRMADO"
  input.target.iff_status != "FRIEND"
  not in_civilian_corridor(input.target.position)
  altitude_above_minimum(input.target.position)
  input.alert_level >= "AMBER"
}

deny[reason] {
  in_civilian_corridor(input.target.position)
  reason := "Trayectoria sobre corredor humanitario"
}
```

Ventajas:
- Auditable por juristas militares (asesoría jurídica del MdD).
- Versionable, firmable, propagable.
- Probable contra escenarios sintéticos antes de producción.

## Artículo 36 — Revisión de armas

Conforme al Protocolo Adicional I (1977), España debe realizar revisión jurídica
de toda nueva arma. Cúpula Celestial debe pasar:
1. **Revisión interna**: Asesoría Jurídica General del MdD.
2. **Revisión multidisciplinar**: Mando Conjunto de Ciberespacio + Estado Mayor + DIGENECO.
3. **Documentación pública** (al menos a alto nivel) para confianza ciudadana.

## Cumplimiento con instrumentos internacionales

- **Convenio sobre Ciertas Armas Convencionales (CCAC)** — debates GGE LAWS en Ginebra.
- **Declaración Política sobre Uso Responsable de IA Militar** (EEUU 2023, España adherida).
- **AI Act UE 2024/1689** — uso militar excluido (art. 2.3), pero adoptamos sus
  principios como buena práctica voluntaria.
- **Convención de Viena sobre relaciones diplomáticas** — geocercas alrededor
  de embajadas y misiones internacionales.

## Comité ético interno

Se propone un **Comité Ético del Programa Cúpula Celestial** con:
- Asesor jurídico militar (DIH/LOAC).
- Filósofo/ético externo (Universidad Pontificia / UNED Cátedra).
- Representante de la sociedad civil (designado por Congreso).
- Especialistas técnicos del programa.
- Veto sobre cambios de doctrina y niveles de autonomía.

Reuniones trimestrales + ad hoc ante cambios significativos.

## Salvaguardas técnicas no eludibles

- **Geo-fence "no-fly"**: hospitales, escuelas, embajadas, espacios protegidos.
- **Time-fence**: hora del día / horario nocturno con autorizaciones más estrictas.
- **Munition-fence**: cargas explosivas requieren autorización adicional.
- **Bloqueo de modo offline** en territorio civil propio sin alerta declarada.

Estas reglas están **codificadas en hardware (HSM)**, no solo en software.
Cambiarlas requiere firma de dos autoridades + actualización física.

## Responsabilidad y atribución

Cadena clara para atribución de responsabilidad (la "responsibility gap" que
plantea la doctrina jurídica de LAWS):

1. **Operador** que autoriza el engagement (responsabilidad inmediata).
2. **Oficial jefe de fuego** (responsabilidad jerárquica).
3. **Comandante de la unidad** (mando táctico).
4. **Autoridad política** que aprueba las ROE (responsabilidad estratégica).
5. **Programa Cúpula Celestial** (responsabilidad técnica del diseño).

Ninguna decisión letal queda sin responsable humano identificado.
