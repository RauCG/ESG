# Estructura del programa — ESG

Gestor de programas (paquetes) para Linux, de enfoque Arch-first. App de escritorio con Tauri 2 (Rust) + Angular 22 (TypeScript) + Tailwind CSS v4.

Fecha del documento: 2026-09-21 (actualizado; versión inicial 2026-09-11).

---

## 1. Contexto actual

ESG es una aplicación de escritorio que gestiona paquetes del sistema desde una interfaz
gráfica: detecta el sistema operativo y los gestores disponibles, lista los programas
instalados por categorías, permite actualizarlos/instalarlos/desinstalarlos/limpiarlos,
ejecuta operaciones con privilegios sudo (mediante diálogo de contraseña) y ofrece una
terminal integrada (PTY + xterm.js).

### Puntos clave del diseño

- **Gestores configurables**: se detectan al inicio (`detect_managers`) y el usuario los
  activa/desactiva durante el onboarding y en Ajustes. Cada gestor pertenece a una familia
  de sistema: `arch`, `debian`, `fedora`, `suse`, `flatpak-snap`.
- **Contraseña sudo**: se solicita por diálogo, se valida con `sudo -S -v` (NUNCA se
  persiste; sólo el timestamp de sudo se cachea; la contraseña validada se retiene en
  memoria para auto-envío) y se envía automáticamente si el propio
  comando pide `[sudo] password for` durante la ejecución en PTY (caja manual como fallback).
- **Operaciones en PTY**: todas las tareas (instalar, actualizar, limpiar, ...) corren en
  una sesión `bash -lc` vía `portable-pty`; la salida se transmite al front con
  `tauri::ipc::Channel<PtsEvent>` (eventos `data` y `exit`). El script captura el código
  real (`code=$?; ...; exit $code`) y cada op vuelca su transcripción a `/tmp/esg-ops.log`.
- **Categorías de programas**: GUI, Terminal, AUR, Flatpak, Snap, cada gestor aporta sus
  categorías a `PackagesService`. Los paquetes Terminal se sub-clasifican en 11 secciones
  funcionales (`format.ts: classifySection`). Solo `pacman -Qm` (extranjeros) da categoría AUR.
- **Extras**: limpieza de paquetes huérfanos, limpieza de cachés, búsqueda en la Tienda y
  actualización individual o completa (actualizaciones en serie para evitar `db.lck`).

### Estado

- Frontend y backend compilan sin errores ni warnings.
  - `ng build` → OK (Angular 22, standalone + signals).
  - `cargo build` → OK (Rust 1.98, tauri 2.11).
- ✅ **Verificado que lanza la ventana** (2026-09-11): `npm run tauri dev` arranca el
  dev server + binario, abre la ventana **ESG** y el CSS se sirve con todas las utilidades
  de Tailwind generadas (`.bg-bg`, `.flex`, `.text-white`, etc.).
- ✅ **Mejoras de 2026-09-12** (implementadas y verificadas con `cargo test` + build):
  - Búsqueda de la Tienda: busca a la vez **aplicaciones instaladas** y paquetes de
    **repos/AUR** (lista única con badges de origen, votos/popularidad de AUR, orden por
    relevancia, dedupe y "Mostrar más").
  - Panel de Operaciones: al minimizarlo queda una **barra inferior** para reabrirlo y,
    si se cierra del todo, una **píldora flotante** "↥ Operaciones (n)"; se auto-expande
    al lanzar una operación nueva.
  - Ajustes: desplegable de **familia rediseñado** (listbox propio, mismo tema).
  - **Descripciones corregidas**: el parser de `pacman -Qi` fallaba por el alineado de
    columnas (busca `field_value` con regex `^Campo\s*:` en vez de prefijo fijo), por lo
    que los paquetes Arch salían sin descripción ni tamaño.
  - Nueva **pantalla de detalle** por paquete (`/programas/:manager/:name`): descripción,
    métricas (tamaño descarga/instalado, votos, popularidad), metadatos, dependencias y
    acciones según estado (Instalar / Actualizar / Abrir / Terminal / Desinstalar).
  - **Secciones funcionales de Terminal**: 11 secciones (`sistema, utilidades, internet,
    desarrollo, multimedia, graficos, juegos, ofimatica, educacion, configuracion, otras`)
    con tarjetas y filtrado en el tab Terminal (`format.ts`, `programs.ts`); insignia de
    sección en tarjeta y detalle.
  - **Descripciones completas por gestor** + enriquecimiento AUR vía **RPC v5**
    (`curl` con timeout, sin colgar sin red): descripción, votos, popularidad, out-of-date,
    **maintainer**, **submitted**, **modified** (`PkgDetails.maintainer|submitted|modified`).
  - **Auto-sudo**: el PTY fuerza `LC_ALL=C` (el prompt español `contraseña` colgaba las ops);
    detección `/\[sudo\]\s+password\s+for/i`, auto-envío de la contraseña retenida,
    `ROOT_BY_KIND` incluye yay/paru, `ops.run(..., wait=true)` y actualizaciones en serie.
- ✅ **Mejoras de 2026-09-21** (verificadas con `cargo test` 10/10 + build + GUI):
  - **"Error de Yay" cerrado como no-bug**: el log de ops demuestra `code=0`
    (`Searching AUR for updates...` → `there is nothing to do`); la "parada" es la
    consulta AUR por red, normal.
  - **Códigos de salida reales** en ops (`code=$?; ...; exit $code`; antes siempre 0).
  - **Log de operaciones** en `/tmp/esg-ops.log` (solo `kind=="op"`, modo 0600).
  - **Compatibilidad yay v13** en `search_repos_arch`: acepta el corchete de antigüedad
    `[307d16h]` de `yay -Ss` (antes: cero resultados AUR en Tienda).
  - **Manager correcto en Tienda**: los resultados nativos de `yay -Ss` llevan
    `manager: "pacman"` (antes `"yay"` para todo); el dedupe por (manager, nombre)
    fusiona instalado+repo sin duplicados y el detalle abre la ruta correcta.

### Notas de integración (importantes)

- **PostCSS**: Angular 22 solo carga la configuración de PostCSS desde
  `postcss.config.json` o `.postcssrc.json` (NO `.mjs`). El fichero real es
  `.postcssrc.json` con `{ "plugins": { "@tailwindcss/postcss": {} } }`.
  Si no existe con ese nombre, Tailwind no se procesa y la app queda sin estilos.
- **Wayland**: ver nota más abajo (arrancar con `GDK_BACKEND=x11
  WEBKIT_DISABLE_DMABUF_RENDERER=1`).

---

## 2. Estructura de carpetas

```
ProgramaLocalRaux/
├── src/                         # Frontend Angular
│   ├── main.ts                  # Bootstrap de la app
│   ├── index.html
│   ├── styles.css               # Tailwind v4 (@theme) + CSS de xterm
│   └── app/
│       ├── app.ts / app.html    # Shell: sidebar + router-outlet + console + dialog
│       ├── app.config.ts        # providers (router)
│       ├── app.routes.ts        # Rutas (lazy loading por página)
│       ├── types.ts             # Tipos compartidos (SystemInfo, Pkg, OpRequest, ...)
│       ├── format.ts            # Formato (bytes, categorías, gestores) + secciones Terminal
│       ├── core/                # Servicios (inyectables)
│       │   ├── settings.service.ts   # Config persistente + detección + boot
│       │   ├── packages.service.ts   # Listado, categorías, updates, orphans, caché, details
│       │   ├── ops.service.ts        # Operaciones y su consola (streaming PTY)
│       │   ├── sudo.service.ts       # Estado de sudo + verificación (-S -v)
│       │   └── terminal.service.ts   # Sesiones de terminal libres
│       ├── components/          # Componentes reutilizables
│       │   ├── password-dialog.ts    # Diálogo de contraseña sudo
│       │   ├── console-panel.ts      # Panel de salida de operaciones (barra/píldora)
│       │   ├── terminal-view.ts      # xterm.js conectado a un PTY
│       │   └── package-card.ts       # Tarjeta de paquete (clicable → detalle)
│       └── pages/               # Páginas (rutas)
│           ├── onboarding/      # Configuración inicial (familia + gestores)
│           ├── dashboard/       # Inicio: resumen y acciones rápidas
│           ├── programs/        # Listado por categorías + acciones
│           ├── package/         # Detalle de paquete (info + instalar/desinstalar)
│           ├── store/           # Tienda/búsqueda (lista única con badges)
│           ├── terminal/        # Terminal integrada
│           ├── maintenance/     # Huérfanos y cachés
│           └── settings/        # Ajustes y re-detección
│
├── src-tauri/                   # Backend Rust
│   ├── Cargo.toml               # tauri 2.11, portable-pty, tokio, regex
│   ├── tauri.conf.json          # Producto ESG, ventana "main", frontend dist
│   ├── build.rs
│   ├── capabilities/default.json # Permisos: core:default
│   ├── icons/                   # Iconos de la app (requeridos por generate_context!)
│   └── src/
│       ├── main.rs              # Entry point
│       ├── lib.rs               # Registro de todos los #[tauri::command]
│       ├── model.rs             # Tipos de datos compartidos con el front (serde)
│       ├── settings.rs          # Config persistente (JSON en app_config_dir)
│       ├── detect.rs            # Detección de OS, familia y gestores
│       ├── packages.rs          # list_packages, list_updates, search, orphans, cache
│       ├── ops.rs               # Scripts de operaciones + launch_desktop
│       ├── pty.rs               # Sesiones PTY (spawn, attach, write, resize, kill)
│       ├── sudo.rs              # verificar/su coche sudo (-S -v)
│       └── util.rs              # Helpers (desktop_dirs, command_exists, du)
│
├── docs/                        # Documentación del proyecto
│   └── estructura_programa.md   # Este documento (arquitectura + build)
├── scripts/
│   └── pack-program.mjs         # Genera programBuild/ (binario, icono, .desktop, install.sh)
├── public/
│   └── codigo.png               # Icono fuente de la app (512x512)
└── package.json                 # Scripts: build, tauri dev, build:program, install:program, etc.
```

---

## 3. Comandos IPC (front ⇄ Rust)

| Comando            | Finalidad                                        |
| ------------------ | ------------------------------------------------ |
| `system_info`      | Datos del SO (distro, kernel, desktop, arch, ...)|
| `get_settings`     | Leer configuración guardada                      |
| `save_settings`    | Guardar configuración                            |
| `detect_managers`  | Detectar gestores para una familia               |
| `list_packages`    | Paquetes instalados por gestor (con categoría)   |
| `list_updates`     | Actualizaciones pendientes por gestor            |
| `search_packages`  | Búsqueda en la tienda (instalados + repos/AUR, una lista) |
| `package_details`  | Info detallada de un paquete (version, tamaños, deps, ...) |
| `get_orphans`      | Paquetes huérfanos                               |
| `get_cache_info`   | Tamaño y rutas de las cachés                     |
| `launch_app`       | Lanzar una app de escritorio (.desktop)          |
| `sudo_status`      | ¿sudo con privilegios (timestamp) activo?        |
| `verify_sudo`      | Validar contraseña con `sudo -S -v`              |
| `pty_create`       | Crear sesión PTY (`bash -lc`)                    |
| `pty_attach`       | Conectar a la sesión con un Channel              |
| `pty_write` / `pty_resize` / `pty_close` | I/O de la terminal        |
| `op_start` / `op_cancel` | Lanzar/cancelar una operación (kind + manager) |

Tipos de operación (`OpKind`): `update`, `upgrade`, `install`, `uninstall`, `orphans`,
`cache`.

---

## 4. Capas e infraestructura

### 4.1 Backend (Rust)

- **`model.rs`**: `SystemInfo`, `ManagerInfo`, `Pkg`, `Settings`, `OpRequest`, `SearchResult`,
  `PkgDetails`, `CacheInfo`, `AurResult` (serde, mismos nombres que `types.ts`).
- **`settings.rs`**: JSON en el directorio de configuración; lo lee `SettingsService.boot()`.
- **`detect.rs`**: lee `/etc/os-release` y ejecuta la detección binario a binario.
- **`packages.rs`**: ejecuta los gestores con argumentos estables; parsea la salida;
  p.ej. `pacman -Q` / `-Qe` (explícitos) / `-Qm` (extranjeros = AUR), `apt list --installed`,
  `flatpak list --app`, etc. Normaliza a `Pkg { name, manager, category }` (solo extranjeros
  → `category: "aur"` con manager = helper yay/paru). `search_packages` fusiona instalados
  + repos + AUR en un solo resultado (dedupe por (manager, nombre), relevancia,
  votos/popularidad AUR, `(Out-of-date)`; tolera el corchete de antigüedad `[NdNh]` de
  yay v13; resultados nativos con `manager: "pacman"` aunque los liste yay).
  `package_details` consulta `-Qi`/`-Si` según estado, y para AUR enriquece vía RPC v5
  (`aur_rpc` con `curl` + timeout: descripción, votos, popularidad, maintainer, submitted,
  modified). `arch_updates` usa el helper (`-Qu`) o `checkupdates`.
- **`ops.rs`**: `script_for` genera el comando por `(kind, manager)`; `start_op` lo lanza
  en PTY. Script final = `echo '» label'; <script>; code=$?; echo; echo "Proceso finalizado
  (código $code)."; exit $code` (el código real se propaga al evento `exit`).
- **`pty.rs`**: mapa de sesiones (`Mutex<HashMap<u32, PtsSession>>`). `spawn_shell` crea el
  PTY con `LC_ALL=C`/`LANG=C` (sudo siempre pide en inglés), lee de la máster, guarda
  `capture` (últimos 128 KB) para replay y emite eventos via Channel. `attach` reenvía el
  capture guardado al nuevo Channel. Al terminar una op (`kind=="op"`) vuelca la
  transcripción (últimos 8 KB) a `/tmp/esg-ops.log` (modo 0600).
- **`sudo.rs`**: `verify_sudo` escribe la contraseña por stdin en `sudo -S -v` (detecta
  también `contraseña incorrecta`); devuelve éxito/error. Nunca guarda la contraseña.
- **`util.rs`**: `run_capture*` (siempre con locale C), `run_capture_timeout` (vía `timeout`
  de coreutils, para llamadas remotas), `field_value`/`field_block`, `parse_installed_size`.

### 4.2 Frontend (Angular)

- **`SettingsService`**: `boot()` (llama `system_info` + `get_settings` o `detect_managers`),
  `detect(family)`, `save(partial)`, `markConfigured()` (localStorage `esg.configured`).
- **`PackagesService`**: señal `pkgs`, `updates`, `loaded`; `refresh()` = `list_packages` +
  `list_updates` por cada gestor activo y fusiona `pkg.update`; `categories()` (orden desde
  `CATEGORY_ORDER`); `orphans()`, `cacheInfo()`, `search(q)`, `details(manager, name)`.
- **`OpsService`**: señal `ops: ActiveOp[]`; `run(req, label?, wait=false)` crea un op con
  Channel, acumula la salida, limpia ANSI y detecta `[sudo] password for`
  (`/\[sudo\]\s+password\s+for/i` sobre ventana de ~400 chars) para auto-enviar la
  contraseña retenida (`SudoService.password()` + `sendPassword`) o pedirla inline como
  fallback (`pendingSudo` + caja "Enviar contraseña"); `ROOT_BY_KIND` indica qué gestores
  requieren root por tipo de operación (incluye yay/paru); con `wait=true` la promesa no
  resuelve hasta el evento `exit` (actualizaciones en serie en Dashboard/Programas).
- **`SudoService`**: retiene la contraseña validada en memoria (`stored`, getter
  `password()`), se limpia al cancelar/fallar.
- **`TerminalService`**: `open()` → `pty_create`; lista de `sessionId`s para la página Terminal.
- **`ConsolePanel`**: al colapsarlo queda una barra inferior fija que lo reexpande (con la
  salida de la op activa) y al cerrarlo del todo, una píldora flotante "↥ Operaciones (n)";
  se auto-expande al lanzar una operación nueva.
- **`PasswordDialog`**: servicio de señal; `PasswordDialog.open()` muestra el diálogo y
  `UserInput` una contraseña; `SudoService.verify(pwd)` la valida.

### 4.3 Terminal (xterm.js + PTY)

- `TerminalView` crea un `Terminal` (tema oscuro, `scrollback` 5000), carga `FitAddon`,
  `pty_attach` con un `Channel<PtsEvent>` y reenvía teclado/resize por `pty_write`/`pty_resize`.
- La página Terminal mantiene una lista de `terminal-view` (una por sesión).

---

## 5. Flujo de arranque

1. `App.ngOnInit()` → `SettingsService.boot()`:
   - `system_info` → señal `system`.
   - Si hay `get_settings`, aplica familia + gestores + preferencias.
   - Si no hay, detecta la familia sugerida (`defaultFamily`).
2. Si no está configurado (`localStorage` sin `esg.configured`) → redirige a `/onboarding`.
3. Onboarding: familia + toggles de gestores → `save_settings` + `markConfigured()` → `/inicio`.
4. Dashboard carga `PackagesService.refresh()` y muestra resumen + actualizaciones.

---

## 6. Scripts de operación por gestor (resumen)

| Operación | pacman                  | yay/paru                     | apt                     | dnf            |
| --------- | ----------------------- | ---------------------------- | ----------------------- | -------------- |
| update    | `sudo pacman -Syu --noconfirm` | `<mgr> -Syu --noconfirm --cleanafter` | `update && upgrade -y` | `dnf upgrade -y` |
| upgrade   | `sudo pacman -Syu --noconfirm` | `<mgr> -S --noconfirm --needed` | `install --only-upgrade`| `dnf upgrade -y` |
| install   | `sudo pacman -S --noconfirm --needed` | `<mgr> -S --noconfirm --needed` | `install -y` | `dnf install -y` |
| uninstall | `sudo pacman -Rns --noconfirm` | `sudo pacman -Rns --noconfirm` | `autoremove --purge` | `dnf remove -y` |
| orphans   | script `-Qtdq`          | —                            | `autoremove -y`         | `dnf autoremove -y`|
| cache     | `paccache -rk1 && -ruk0`| `<mgr> -Sc --noconfirm`      | `apt-get clean`         | `dnf clean all`|

Más gestores: `zypper`, `flatpak`, `snap`. Nota: yay/paru corren SIN sudo prefijado porque
ellos mismos elevan privilegios (el auto-sudo del PTY responde a su prompt interno).

---

## 7. Comandos útiles

```bash
npm run build        # Build de producción del front (out: dist/ESG)
npm run tauri dev    # Entorno de desarrollo (también compila Rust)
cd src-tauri && cargo test         # Tests del backend (10 tests)
cd src-tauri && cargo build        # Solo backend
cd src-tauri && cargo check        # Chequeo rápido del backend
```

> Nota (Wayland): en sesiones Wayland la ventana puede abortar con
> `Gdk-Message: Error 71 (Error de protocolo) dispatching to Wayland display`.
> Se resuelve forzando el backend X11 y desactivando el renderer DMABUF:
>
> ```bash
> GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri dev
> ```

---

## 8. Compilar e instalar (programBuild)

- Icono: fuente en `public/codigo.png` (512x512); set Tauri en `src-tauri/icons/`
  (generado con `./node_modules/.bin/tauri icon public/codigo.png` y referenciado en
  `tauri.conf.json > bundle.icon`). El binario se auto-ajusta al entorno gráfico al
  arrancar (`main.rs: tune_graphics_env`: Wayland → desactiva DMABUF de WebKit y usa
  X11 si hay `DISPLAY`; respeta vars explícitas).
- `npm run build:program` = `tauri build` + `node scripts/pack-program.mjs`: crea
  **`programBuild/`** (ignorada por git) con `esg` (binario), `esg.png` (icono),
  `esg.desktop` (plantilla con `@@BIN@@`/`@@ICON@@`) e `install.sh`.
- `npm run install:program` (o `bash programBuild/install.sh`): instala por usuario sin
  root en `~/.local/bin`, `~/.local/share/icons`, `~/.local/share/applications`
  (resolviendo las rutas reales; `BIN_DIR` overrideable). Detallado en el README.

## 9. Pendientes / próximos pasos

- Verificación visual en GUI del fix de managers de la Tienda (una sola entrada por
  programa, insignia `pacman` en nativos).
- Repo GitHub creado: `https://github.com/RauCG/ESG` (privado, rama `main`).
- Decisiones futuras: empaquetado (`bundle` actualmente desactivado), flatpak/snap reales
  instalados en el sistema de destino.