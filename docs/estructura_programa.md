# Estructura del programa — ESG

Gestor de programas (paquetes) para Linux, de enfoque Arch-first. App de escritorio con Tauri 2 (Rust) + Angular 22 (TypeScript) + Tailwind CSS v4.

Fecha del documento: 2026-09-11.

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
  persiste; sólo el timestamp de sudo se cachea) y se puede enviar inline si el propio
  comando pide `[sudo] password for` durante la ejecución en PTY.
- **Operaciones en PTY**: todas las tareas (instalar, actualizar, limpiar, ...) corren en
  una sesión `bash -lc` vía `portable-pty`; la salida se transmite al front con
  `tauri::ipc::Channel<PtsEvent>` (eventos `data` y `exit`).
- **Categorías de programas**: GUI, Terminal, AUR, Flatpak, Snap (y categoría propia,
  p.ej. aur), cada gestor aporta sus categorías a `PackagesService`.
- **Extras**: limpieza de paquetes huérfanos, limpieza de cachés, búsqueda en la Tienda y
  actualización individual o completa.

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
│       ├── format.ts            # Utilidades de formato (bytes, categorías, gestores)
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
│   └── estructura_programa.md   # Este documento
└── package.json                 # Scripts: build, tauri dev, etc.
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
  p.ej. `pacman -Qqe` / `pacman -Qm` (AUR), `apt list --installed`, `flatpak list --app`,
  etc. Normaliza a `Pkg { name, manager, category }`. `search_packages` fusiona instalados
  + repos + AUR en un solo resultado (dedupe, relevancia, votos/popularidad AUR,
  `(Out-of-date)`). `package_details` consulta `-Si`/`-Qi` según el gestor.
- **`ops.rs`**: `script_for` genera el comando por `(kind, manager)`; `start_op` lo lanza
  en PTY. Importante: script final = `echo '» label'; <script>; echo; echo 'Proceso finalizado ($?).'`.
- **`pty.rs`**: mapa de sesiones (`Mutex<HashMap<u32, PtsSession>>`). `spawn_shell` crea el
  PTY, lee de la máster, guarda `caption` (últimas ~4 KB) para replay y emite eventos via
  Channel. `attach` reenvía el caption guardado al nuevo Channel.
- **`sudo.rs`**: `verify_sudo` escribe la contraseña por stdin en `sudo -S -v`; devuelve
  éxito/error. Nunca guarda la contraseña.

### 4.2 Frontend (Angular)

- **`SettingsService`**: `boot()` (llama `system_info` + `get_settings` o `detect_managers`),
  `detect(family)`, `save(partial)`, `markConfigured()` (localStorage `esg.configured`).
- **`PackagesService`**: señal `pkgs`, `updates`, `loaded`; `refresh()` = `list_packages` +
  `list_updates` por cada gestor activo y fusiona `pkg.update`; `categories()` (orden desde
  `CATEGORY_ORDER`); `orphans()`, `cacheInfo()`, `search(q)`, `details(manager, name)`.
- **`OpsService`**: señal `ops: ActiveOp[]`; `run(req, label)` crea un op con Channel,
  acumula la salida, limpia ANSI y detecta `[sudo] password for` para pedir la contraseña
  y enviarla inline (`verify_sudo` cuando aplica); `ROOT_BY_KIND` indica qué gestores
  requieren root por tipo de operación.
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

| Operación | pacman         | yay/paru          | apt                     | dnf            |
| --------- | -------------- | ----------------- | ----------------------- | -------------- |
| update    | `pacman -Syu`  | `-Syu --cleanafter`| `update && upgrade -y`  | `dnf upgrade`  |
| upgrade   | `pacman -Syu`  | `-S --needed`     | `install --only-upgrade`| `dnf upgrade`  |
| install   | `pacman -S --needed` | `-S --needed` | `install -y`       | `dnf install`  |
| uninstall | `pacman -Rns`  | `pacman -Rns`     | `autoremove --purge`    | `dnf remove`   |
| orphans   | script `-Qtdq` | —                 | `autoremove`            | `dnf autoremove`|
| cache     | `paccache`     | `-Sc`             | `apt-get clean`         | `dnf clean all`|

Más gestores: `zypper`, `flatpak`, `snap`.

---

## 7. Comandos útiles

```bash
npm run build        # Build de producción del front (out: dist/ESG)
npm run tauri dev    # Entorno de desarrollo (también compila Rust)
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

## 8. Pendientes / próximos pasos

- Verificación visual final de las nuevas pantallas en la GUI (tienda con badges,
  detalle de paquete, barra de consola, listbox de familia).
- Probar flujos completos en la GUI (onboarding, listado, actualización, terminal).
- Decisiones futuras: empaquetado (`bundle` actualmente desactivado), flatpak/snap reales
  instalados en el sistema de destino.