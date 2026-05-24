# Sandbox LLM Táctico — Cúpula Celestial FASE 2

Perfiles seccomp + AppArmor para aislar el LLM táctico (ollama + decision-engine)
del resto del sistema.

## Archivos

- `seccomp-ollama.json` — perfil restrictivo para el container Ollama.
- `seccomp-decision-engine.json` — perfil para decision-engine (FastAPI Python).
- `apparmor-decision-engine.conf` — AppArmor profile (Linux host únicamente).

## Aplicación vía docker-compose

Ya integrado en `docker-compose.yml`:

```yaml
ollama:
  security_opt:
    - seccomp=./sandbox/seccomp-ollama.json
    - no-new-privileges:true
  cap_drop: [ALL]
  read_only: true
  tmpfs: [/tmp, /root/.ollama-cache]

decision-engine:
  security_opt:
    - seccomp=./sandbox/seccomp-decision-engine.json
    - apparmor=cupula-decision-engine
    - no-new-privileges:true
  cap_drop: [ALL]
  read_only: true
  tmpfs: [/tmp]
```

## Instalación AppArmor (Linux host)

```bash
sudo cp orquestador/sandbox/apparmor-decision-engine.conf \
       /etc/apparmor.d/cupula-decision-engine
sudo apparmor_parser -r /etc/apparmor.d/cupula-decision-engine
sudo aa-status | grep cupula
```

## Verificar perfil seccomp activo

```bash
docker compose up -d decision-engine
docker inspect cupula-decision-engine | jq '.[0].HostConfig.SecurityOpt'
# Output esperado: ["seccomp=...", "apparmor=...", "no-new-privileges:true"]

# Test: intentar `unshare` desde dentro del container debe fallar:
docker compose exec decision-engine python -c 'import os; os.unshare(0x10000000)'
# → OSError: [Errno 1] Operation not permitted
```

## Limitaciones conocidas

- **AppArmor sólo Linux**: en hosts Windows/Mac queda como guía teórica. Docker
  Desktop usa una VM Linux internamente, pero la integración AppArmor con perfiles
  de host requiere `docker-compose.yml` extra para `--security-opt=apparmor=...`.
- **seccomp funciona cross-platform** porque Docker lo aplica desde el daemon.
- **Profile lockdown**: los syscalls permitidos son los necesarios para Python 3.12 +
  asyncio + httpx + redis-py + uvicorn. Cualquier librería adicional puede requerir
  actualizar el perfil.

## Cómo descubrir syscalls faltantes (cuando algo rompe)

```bash
# Lanzar el container SIN seccomp restrictivo y capturar trace:
docker run --rm --security-opt seccomp=unconfined \
           --cap-add SYS_PTRACE \
           cupula-celestial-decision-engine \
           strace -f -c -o /tmp/syscalls.txt python -m uvicorn ...
# Revisar syscalls usadas y añadirlas al perfil.
```

## Siguiente nivel (PENDIENTE)

- **gVisor** (Sandbox runtime de Google): añadir `runtime: runsc` a los servicios
  ollama y decision-engine en `docker-compose.yml` y instalar runsc en el host.
- **Firecracker microVMs**: para LLM táctico con aislamiento hardware-grade
  (KVM-based). Requiere bare-metal o nested-virt.
- **SELinux MLS**: para producción con clasificación de información, perfiles
  por nivel (CONFIDENTIAL → SECRET → TOP SECRET).
