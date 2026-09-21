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
# Instala ESG en el equipo local (solo usuario, sin root).
# Uso: bash install.sh   (desde esta misma carpeta)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="\${BIN_DIR:-$HOME/.local/bin}"
APP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons"
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
