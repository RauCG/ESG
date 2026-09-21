# ESG — Gestor de programas Linux

Aplicación de escritorio (Arch-first) para gestionar paquetes del sistema desde una
interfaz gráfica: detecta el SO y los gestores disponibles, lista los programas instalados
por categorías, permite actualizarlos/instalarlos/desinstalarlos/limpiarlos y ofrece una
terminal integrada.

Stack: **Tauri 2** (Rust) + **Angular 22** (TypeScript) + **Tailwind CSS v4**.

La arquitectura está documentada en [`docs/estructura_programa.md`](docs/estructura_programa.md).

## Requisitos

- Node.js + npm
- Rust (cargo) y las dependencias de Tauri para Linux
  (`webkit2gtk`, `libayatana-appindicator`, etc. según tu distro)
- El icono de la app vive en `public/codigo.png` (512x512); el set completo de iconos
  de Tauri se genera en `src-tauri/icons/` con:
  ```bash
  ./node_modules/.bin/tauri icon public/codigo.png
  ```

## Desarrollo

```bash
npm install
npm run tauri dev
```

En sesiones Wayland, si la ventana aborta con `Error 71 dispatching to Wayland display`,
arranca con:

```bash
GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri dev
```

(El binario release ya se auto-ajusta solo al arrancar; esto solo afecta al modo dev.)

Tests del backend: `cd src-tauri && cargo test`.

## Compilar e instalar (programBuild)

Para compilar la app y dejarla lista para instalar en cualquier equipo Linux:

```bash
npm run build:program
```

Esto compila el binario release y crea la carpeta **`programBuild/`** en la raíz con:

| Fichero         | Contenido                                                        |
| --------------- | ---------------------------------------------------------------- |
| `esg`           | Binario release (se apaña solo en X11/Wayland, sin vars manuales)|
| `esg.png`       | Icono de la app                                                  |
| `esg.desktop`   | Lanzador (con `@@BIN@@` / `@@ICON@@` como rutas a resolver)       |
| `install.sh`    | Instalador por usuario (sin root)                                |

Para instalarla en tu equipo (o en cualquier otro copiando la carpeta):

```bash
npm run install:program
# o bien: bash programBuild/install.sh
```

El instalador, además de copiar los ficheros (sin root), **prepara las
dependencias del sistema por distro** (WebKitGTK/GTK/soup vía `pacman`, `apt`,
`dnf` o `zypper` con sudo; solo lo que falte) y hace un **pre-flight de glibc**
(>= 2.39; si no, aborta con mensaje claro en vez del críptico `GLIBC_2.39 not
found`). Requiere red para descargar paquetes del sistema.

Instala en `~/.local/bin/esg`, el icono en `~/.local/share/icons/esg.png` y el lanzador
en `~/.local/share/applications/esg.desktop`. Después aparece como **ESG** en el
lanzador de aplicaciones (desde ahí se fija al escritorio o al panel).

Comandos relacionados:

```bash
npm run pack:program      # Solo regenera programBuild/ (requiere binario ya compilado)
BIN_DIR=/opt/esg bash programBuild/install.sh   # Instalar el binario en otra ruta
```

`programBuild/` está en `.gitignore`: se genera, no se versiona.

## Instalar en otras distros (.deb / .rpm)

El binario necesita el webview del sistema (WebKitGTK). Los paquetes nativos lo
declaran como dependencia y el gestor lo instala solo. Verificado con Docker.

```bash
# Debian 13 / Ubuntu 24.04+ (y derivadas con glibc >= 2.39)
sudo apt install ./programBuild/ESG_0.1.0_amd64.deb
```

Matriz de soporte (binario compilado en Arch, glibc 2.44):

| Distro | Estado | Notas |
| ------ | ------ | ----- |
| Debian 13, Ubuntu 24.04+ | ✅ | `apt install` resuelve webkit/gtk/soup solo |
| Debian 12 y anteriores, Ubuntu 22.04 | ❌ | glibc del sistema (2.36) < 2.39 requerida |
| Fedora/RHEL recientes (glibc >= 2.39) | ✅* | Con `.rpm` (ver abajo) |
| Arch / derivadas rolling | ✅ | `bash programBuild/install.sh` (webkit ya está si usas el escritorio) |

Para generar el `.rpm` (Fedora/RHEL/openSUSE): instala `rpm-tools`, añade `"rpm"`
a `bundle.targets` en `src-tauri/tauri.conf.json` y recompila (`npm run build:program`).
El `.deb` se genera siempre y `pack-program` lo copia a `programBuild/`.
