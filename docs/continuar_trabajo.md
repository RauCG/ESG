# Continuar trabajo ESG — contexto de sesión

Documento para retomar el trabajo donde se dejó.

- Última sesión: 2026-09-21
- Estado global: **error de Yay en GUI descartado como bug** (era la fase normal "Searching AUR", código 0 verificado en log); corregidos 3 bugs reales (código de salida de ops, parser `yay -Ss` v13, manager de resultados nativos en Tienda).

---

## 1. Entorno y datos del sistema (Arch Linux)

- Distro: **Arch Linux** rolling. Sudo **1.9.17p2**, helper AUR **yay** (no paru, no flatpak, no snap).
- `LANG=es_ES.UTF-8` y existe `/usr/share/locale/es/LC_MESSAGES/sudo.mo` → **sudo localiza su prompt** en el PTY si no se fuerza locale (el arreglo de la sesión fuerza `LC_ALL=C`).
- Hay `curl`, `wget`, `checkupdates`, `timeout` (coreutils) disponibles.
- Actualizaciones AUR pendientes en el momento de la sesión (probado con `yay -Qu`):
  `protonplus`, `yay`, `brave-bin`, `visual-studio-code-bin`, `onlyoffice-bin`, `polychromatic`, `surfshark-client` (12 paquetes AUR instalados).
- Sonda relevante: `yay -Syu --noconfirm --cleanafter --print` **sin TTY** → `sudo: a terminal is required to read the password...`. Confirma que **yay requiere sudo incluso para decidir**; dentro del PTY de la app sudo pide `[sudo] password for ...` y ESG lo maneja inline.

## 2. Arranque del entorno de desarrollo

```bash
# desacoplado para que sobreviva al shell:
cd /mnt/juegos/Programacion/ProgramaLocalRaux
setsid nohup env GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri dev \
  > /tmp/opencode/esg/dev.log 2>&1 < /dev/null &
```

- Log: `/tmp/opencode/esg/dev.log` (a veces el shell de la herramienta corta el comando a los 120 s, pero el proceso sobrevive por `setsid`; verificarlo con `ps aux | grep -E "[t]auri|[n]g serve"`).
- Frontend: `ng serve` con **hot-reload** (los cambios TS se recargan solos). Backend Rust: requiere recompilar (reiniciar `tauri dev` o `cargo build`).
- Verificación CLI: `cargo build` (o `cargo test`) en `src-tauri/`, y `npm run build` (salida en `dist/ESG`).

## 3. Estado de la implementación (todo verificado)

### 3.1 Secciones funcionales para programas de terminal (función ya entregada antes)
- `src/app/types.ts` → `export type Section` (11 valores: `sistema, utilidades, internet, desarrollo, multimedia, graficos, juegos, ofimatica, educacion, configuracion, otras`).
- `src/app/format.ts` → `SECTION_LABEL`, `SECTION_ORDER`, `sectionColor()`, `SECTION_ICON`, `SECTION_RULES` + `classifySection(name, description)` (heurística por palabras clave, prioridad: juegos > desarrollo > multimedia > sistema > graficos > internet > ofimatica > configuracion > educacion > utilidades > fallback `otras`).
- `src/app/pages/programs/programs.ts` → tarjetas de sección en el tab Terminal, señal `sub`, `setTab()` resetea `sub`, "Volver a secciones".
- `src/app/components/package-card.ts` y `pagina detalle` → la insignia muestra la sección para `category==='terminal'`; el botón "Terminal" sigue con `category==='terminal'||'aur'`.
- Al filtrar por sección solo se usan paquetes `terminal` (GUI/AUR/flatpak/snap intactos).

### 3.2 Descripciones completas (función anterior) + enriquecimiento AUR (sesión actual)
- Backend por gestor: apt → `Description-en` de `apt-cache show` (`field_block`); rpm instalado → `%{DESCRIPTION}`; rpm remoto → bloque `Description`; snap → `description:` multilínea; pacman/yay → single-line (`Description` de `-Qi`/`-Si`).
- Frontend detalle (`package.ts`): `whitespace-pre-line`, y bloque de descripción **siempre visible** (placeholder "Sin descripción disponible." si vacía).
- **Nuevo en esta sesión**: `arch_details` usa **AUR RPC v5** (`curl -s --connect-timeout 4 --max-time 8`, parseado con `serde_json`) para paquetes AUR (mejora frente a `yay -Si` que SE COLGABA sin red). Rellena descripción, votos, popularidad, out-of-date, **maintainer**, **submitted**, **modified** (fechas ISO via `ts_to_date`).
- Modelo: `PkgDetails.maintainer|submitted|modified` añadidos (model.rs, types.ts, y en los 6 constructores de packages.rs).
- Filas nuevas en detalle: "Mantenedor (AUR)", "Enviado (AUR)", "Última modificación (AUR)".

### 3.3 Arreglo de actualizaciones "pilladas" (causa raíz encontrada)
- **Causa**: el PTY heredaba `LANG=es_ES.UTF-8` → sudo pedía `[sudo] contraseña para …` y el detector del frontend buscaba `[sudo] password for` → nunca se mostraba la caja de contraseña → op colgada a medias (afectaba a pacman y yay).
- Cambios:
  - `src-tauri/src/pty.rs` `spawn_shell`: fuerza `LC_ALL=C`, `LANG=C`, `LANGUAGE=C` (además de `TERM=xterm-256color`).
  - `src/app/core/ops.service.ts`:
    - `SUDO_PROMPT = /\[sudo\]\s+password\s+for/i`; detección sobre ventana de últimos ~400 chars (corte de chunks).
    - **Auto-envío** de la contraseña validada (`SudoService.password()`) vía `sendPassword` cuando se detecta el prompt; caja manual de "Enviar contraseña" queda como fallback cuando no hay contraseña en memoria.
    - `ROOT_BY_KIND` ahora incluye `yay`/`paru` en update/upgrade/install/uninstall.
    - `run(req, label?, wait=false)`: si `wait=true`, la promesa NO resuelve hasta recibir el evento `exit` del op.
  - `src/app/core/sudo.service.ts`: retiene la contraseña validada en memoria (`stored`), getter `password()`, se limpia en `cancelPassword`, `clear()` y al fallar con error que contenga "Cancelado".
  - `src-tauri/src/sudo.rs`: `verify_password` también detecta `contraseña incorrecta`.
- **Encadenado en serie** de actualizaciones para evitar colisión del `db.lck` de pacman:
  - `dashboard.ts updateAll()` → `ops.run(..., true)`.
  - `programs.ts updateAllPending()` → `ops.run(..., true)`.
- Resultado confirmado por el usuario: **pacman ya actualiza correctamente** (se acaba el flujo). Yay sigue dando "error de código" — pendiente de diagnóstico (ver sección 4).

### 3.4 Utilidades nuevas
- `src-tauri/src/util.rs` `run_capture_timeout(prog, args, secs)` (usa `timeout` de coreutils; fallback sin timeout si no existe). Usado para llamadas remotas (curl AUR, `-Si` de helper).

### 3.5 Tests (todos pasan)
- `cargo test` → **10/10** (8 existentes + `ts_to_date_formatea_timestamps` + `aur_result_parsea_respuesta_rpc`).
- `cargo build` OK. `npm run build` OK.

## 4. PENDIENTE / PROBLEMA ABIERTO — error de Yay en actualización

- Síntoma (usuario): con pacman ya actualiza; "con la librería de Yay da un error de código" (el panel de Operaciones muestra `con errores (código N)`).
- **No se ha podido ver la salida exacta de la op** (el texto vive solo en el frontend; no se persiste en log).
- Hipótesis razonadas:
  1. **Fallo real de build AUR** (makepkg): hay paquetes pendientes (p. ej. `polychromatic` si falta `go`, `protonplus`, `surfshark-client`) → yay sale con código != 0. Sería comportamiento correcto, no un bug.
  2. **Segundo prompt de sudo no auto-enviado**: `sudoSent` impide re-enviar; si yay vuelve a pedir sudo al final (instalar AUR / build), se quedaría esperando → colgado, no error. Improbable pero revisar.
  3. **Timestamp sudo por TTY**: `verify_sudo` (`sudo -S -v`, sin TTY) cachea un ticket que quizá no cubre el PTY de la op si sudoers tiene `tty_tickets` activado (por defecto está ON). El auto-envío cubre este caso (el primera sudo dentro del PTY pide y se responde). Para garantizarlo por completo se podría jugar con `Defaults !tty_tickets` o `timestamp_type=global` en un drop-in de sudoers (cambiaría el sistema, decidir con el usuario).
- **Siguiente paso**: pedir/ver el contenido del panel de Operaciones de la operación "Actualizar todo (yay)" (código + últimas líneas o screenshot) para distinguir 1 vs 2/3. Si es 1, revisar qué paquete falla e informar (no es bug). Si es 2/3, ajustar auto-envío (p. ej. permitir más de un envío por op con cooldown) o configurar timestamp global.
- Nota: no relanzar el checklist manual hasta arrancar de nuevo la app (comando de la sección 2).

## 5. Checklist de verificación manual pendiente (GUI)
1. Dashboard → **Actualizar todo**: debe pedir sudo la primera vez (diálogo), completar `pacman` y luego `yay` (en serie), cada op terminando "completado".
2. Detalle de un AUR no instalado (Tienda → búsqueda p. ej. `brave-bin`): descripción completa + Mantenedor + fechas + votos.
3. Detalle de un paquete nativo de Arch (p. ej. `curl`): descripción (una línea) visible; sin descripción → placeholder.
4. Tab Terminal de Programas → tarjetas de sección, filtrado y "Volver a secciones".
5. Comprobar que el texto de la op de Yay (si falla) se captura para el diagnóstico de la sección 4.

## 6. Referencias rápidas de ficheros clave
- Backend: `src-tauri/src/packages.rs` (listado/updates/details: `arch_updates`, `aur_rpc`, `arch_details`, `field_block`), `ops.rs` (scripts de operación), `pty.rs` (PTY + locale), `util.rs` (`run_capture*`, `field_value`, `field_block`), `sudo.rs`, `model.rs`.
- Frontend: `src/app/core/ops.service.ts` (ops, ROOT_BY_KIND, auto-sudo), `sudo.service.ts`, `packages.service.ts` (refresh/updates/details), `src/app/format.ts` (secciones), `src/app/pages/*` (dashboard, programs, package, store), `src/app/components/console-panel.ts` (panel ops + envío manual de contraseña).
- Docs: `docs/estructura_programa.md` (arquitectura), `docs/revision_actualizaciones_yay.md` (revisión yay antigua, algo desactualizada en lo del ROOT_BY_KIND), `docs/continuar_trabajo.md` (este documento).

## 8. Sesión 2026-09-21 — diagnóstico del "error de Yay" y confusión AUR

- Entorno arrancado con el comando de la sección 2 (log `/tmp/opencode/esg/dev.log`).
- **"Error de Yay" CERRADO como no-bug**: el usuario lanzó Dashboard → Actualizar todo;
  el panel decía "Completado código 0". El log nuevo `/tmp/esg-ops.log` lo confirma:
  op yay → sync DBs → `Searching AUR for updates...` → `there is nothing to do`,
  `success=true code=Some(0)`. El "pillado" es yay consultando AUR por red (lento
  con ~14 paquetes AUR); el auto-envío de sudo funcionó sin caja manual.
- **Bug 1 (códigos de salida enmascarados)** — `ops.rs::start_op`: el script terminaba
  con `echo 'Proceso finalizado (código $?)'` donde `$?` era el del `echo` previo
  (siempre 0), y el exit del PTY también era siempre 0. Ahora: `code=$?; ...; exit $code`.
- **Diagnóstico permanente** — `pty.rs`: al terminar una op con `kind=="op"` se añade
  la transcripción (últimos 8 KB) a `/tmp/esg-ops.log` (modo 0600; la contraseña de
  sudo no aparece porque sudo la lee sin echo). Nunca se registran terminales libres.
- **Bug 2 (Tienda vacía de AUR con yay v13)**: yay 13.0.1 imprime `aur/nombre ver
  (+N pop) [307d16h]` (corchete de antigüedad) y la regex de `search_repos_arch` no lo
  aceptaba → cero resultados AUR y test `search_repos_parsea_votos` en rojo.
  Corregido aceptando un corchete opcional (la crate `regex` no admite look-ahead,
  así que es genérico; el flag `installed` sale del HashSet, no del marcador).
  `cargo test` vuelve a 10/10.
- **Bug 3 ("todo detectado como AUR")**: en la Tienda, TODOS los resultados de
  `yay -Ss` llevaban `manager: "yay"`, incluidos nativos (`extra/...`), y el dedupe
  por (manager, nombre) no fusionaba instalado+repo (duplicados). El detalle abría
  `/programas/yay/<nativo>` con enriquecimiento AUR innecesario. Ahora los no-AUR
  llevan `manager: "pacman"`. Dato verificado: Dashboard muestra AUR ~14 de 1201,
  listado `pacman -Qm` = 14, `list_arch`/`search_installed_arch` solo marcan `aur`
  a extranjeros. Lo de "todas las pantallas" era la insignia `yay` de la Tienda.
- Nota: `util.rs::capture()` ya forzaba `LC_ALL=C` (los parsers asumen inglés);
  el fallo del test no era de locale sino del formato v13.

## 7. Decisiones de diseño acordadas (recordatorio)
- Las secciones funcionales aplican SOLO a `terminal`; dashboard intacto; fallback de clasificación = `otras`.
- Enviar la contraseña de sudo automáticamente fue la elección del usuario (sudo la escribe sin echo en el PTY; no queda en el log).
- El enriquecimiento AUR depende de red (`curl`); si falla, el detalle cae al bloque local (`-Qi`) sin votos ni fechas, sin colgar nunca.
- No usar `pkill -f "tauri dev"` en la shell (se auto-mató a sí misma); para relanzar, usar el comando `setsid` de la sección 2 y verificar con `ps`.