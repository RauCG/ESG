#!/usr/bin/env node
// Prepara la carpeta programBuild/ con todo lo necesario para instalar ESG
// en cualquier equipo Linux: binario, icono, .desktop e instalador.
// Uso: node scripts/pack-program.mjs  (o `npm run pack:program`)
// Requiere haber compilado antes (`npm run build:program` ya lo hace).
import { cpSync, mkdirSync, writeFileSync, existsSync, chmodSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'programBuild');
const bin = join(root, 'src-tauri', 'target', 'release', 'esg');
const icon = join(root, 'src-tauri', 'icons', 'icon.png');

if (!existsSync(bin)) {
  console.error('No existe el binario release. Ejecuta antes `npm run build:program`.');
  process.exit(1);
}
if (!existsSync(icon)) {
  console.error('No existe src-tauri/icons/icon.png. Ejecuta `./node_modules/.bin/tauri icon public/codigo.png`.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync(bin, join(out, 'esg'));
chmodSync(join(out, 'esg'), 0o755);
cpSync(icon, join(out, 'esg.png'));

writeFileSync(
  join(out, 'esg.desktop'),
  `[Desktop Entry]
Type=Application
Name=ESG
Comment=Gestor de programas Linux
Exec=@@BIN@@
Icon=@@ICON@@
Terminal=false
Categories=System;PackageManager;GTK;
StartupWMClass=ESG
`,
);

writeFileSync(
  join(out, 'install.sh'),
  `#!/usr/bin/env bash
# Instala ESG en el equipo local.
# - Ficheros (binario, icono, lanzador): solo usuario, sin root.
# - Dependencias del sistema (WebKitGTK/GTK/soup): se detectan por distro
#   y se instalan con sudo lo que falte. Requiere red.
# Uso: bash install.sh   (desde esta misma carpeta)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="\${BIN_DIR:-$HOME/.local/bin}"
APP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons"

SUDO="sudo"
if [ "$(id -u)" -eq 0 ]; then SUDO=""; fi

fail() { echo "ERROR: $*" >&2; exit 1; }

# --- 1. Pre-flight: glibc >= 2.39 (el binario se compila en Arch moderno) ---
if command -v ldd >/dev/null 2>&1; then
  # Sin `head` (cierra el pipe y con pipefail+set -e abortaria en silencio).
  GLIBC_VER="$(ldd --version 2>/dev/null | grep -oE '[0-9]+\\.[0-9]+' || true)"
  GLIBC_VER="$(printf '%s' "$GLIBC_VER" | sed -n '1p')"
  if [ -n "\${GLIBC_VER:-}" ]; then
    GLIBC_MAJOR="\${GLIBC_VER%%.*}"
    GLIBC_MINOR="\${GLIBC_VER##*.}"
    if [ "$GLIBC_MAJOR" -lt 2 ] || { [ "$GLIBC_MAJOR" -eq 2 ] && [ "$GLIBC_MINOR" -lt 39 ]; }; then
      fail "glibc $GLIBC_VER detectada; ESG necesita >= 2.39. Usa una distro reciente (Debian 13, Ubuntu 24.04+, Fedora 41+) o instala su .deb."
    fi
    echo "glibc $GLIBC_VER OK (>= 2.39)."
  fi
fi

# --- 2. Dependencias del sistema por familia de distro ---
FAMILY="desconocida"
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  case "\${ID_LIKE:-} \${ID:-}" in
    *arch*) FAMILY="arch" ;;
    *debian*|*ubuntu*) FAMILY="debian" ;;
    *fedora*|*rhel*|*centos*) FAMILY="fedora" ;;
    *suse*|*opensuse*) FAMILY="suse" ;;
  esac
fi
echo "Distro detectada: \${PRETTY_NAME:-desconocida} (familia: $FAMILY)."

need_install_arch() {
  local missing=""
  local p
  for p in webkit2gtk-4.1 gtk3 libsoup3; do
    pacman -Qq "$p" >/dev/null 2>&1 || missing="$missing $p"
  done
  if [ -n "$missing" ]; then
    echo "Instalando dependencias del sistema:$missing"
    $SUDO pacman -S --needed --noconfirm$missing || fail "no se pudieron instalar las dependencias"
  else
    echo "Dependencias del sistema OK."
  fi
}

need_install_debian() {
  local missing=""
  local p
  for p in libwebkit2gtk-4.1-0 libgtk-3-0 libsoup-3.0-0; do
    dpkg -s "$p" >/dev/null 2>&1 || missing="$missing $p"
  done
  if [ -n "$missing" ]; then
    echo "Instalando dependencias del sistema:$missing"
    $SUDO apt-get update -qq || fail "no se pudo actualizar apt"
    $SUDO apt-get install -y -qq$missing || fail "no se pudieron instalar las dependencias"
  else
    echo "Dependencias del sistema OK."
  fi
}

need_install_fedora() {
  local missing=""
  local p
  for p in webkit2gtk4.1 gtk3 libsoup3; do
    rpm -q "$p" >/dev/null 2>&1 || missing="$missing $p"
  done
  if [ -n "$missing" ]; then
    echo "Instalando dependencias del sistema:$missing"
    $SUDO dnf install -y -q$missing || fail "no se pudieron instalar las dependencias"
  else
    echo "Dependencias del sistema OK."
  fi
}

need_install_suse() {
  local missing=""
  local p
  for p in libwebkit2gtk-4_1-0 gtk3 libsoup-3_0-0; do
    rpm -q "$p" >/dev/null 2>&1 || missing="$missing $p"
  done
  if [ -n "$missing" ]; then
    echo "Instalando dependencias del sistema:$missing"
    $SUDO zypper install -y$missing || fail "no se pudieron instalar las dependencias"
  else
    echo "Dependencias del sistema OK."
  fi
}

case "$FAMILY" in
  arch) need_install_arch ;;
  debian) need_install_debian ;;
  fedora) need_install_fedora ;;
  suse) need_install_suse ;;
  *)
    echo "AVISO: distro no reconocida; se omite la comprobacion de dependencias."
    echo "Si ESG no arranca, instala el equivalente a webkit2gtk/gtk3/libsoup3 de tu distro."
    ;;
esac

# --- 3. Ficheros de ESG (sin root) ---
mkdir -p "$BIN_DIR" "$APP_DIR" "$ICON_DIR"
install -m755 "$HERE/esg" "$BIN_DIR/esg"
install -m644 "$HERE/esg.png" "$ICON_DIR/esg.png"
sed -e "s|@@BIN@@|$BIN_DIR/esg|" -e "s|@@ICON@@|$ICON_DIR/esg.png|" "$HERE/esg.desktop" > "$APP_DIR/esg.desktop"
update-desktop-database "$APP_DIR" 2>/dev/null || true
echo "ESG instalado en $BIN_DIR/esg. Buscalo como 'ESG' en tu lanzador de aplicaciones."
`,
);
chmodSync(join(out, 'install.sh'), 0o755);

console.log('programBuild/ listo: esg, esg.png, esg.desktop, install.sh');

// Paquetes nativos (.deb/.rpm) si `tauri build` los generó: llevan las
// dependencias del sistema (webkit2gtk, gtk, soup) declaradas.
const bundleDir = join(root, 'src-tauri', 'target', 'release', 'bundle');
if (existsSync(bundleDir)) {
  for (const f of readdirSync(bundleDir, { recursive: true })) {
    if (typeof f === 'string' && (f.endsWith('.deb') || f.endsWith('.rpm'))) {
      const src = join(bundleDir, f);
      const dst = join(out, f.split('/').pop());
      if (src !== dst) cpSync(src, dst);
      console.log(' + ' + dst.split('/').pop());
    }
  }
}
