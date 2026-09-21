import { Category, Section } from './types';

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return u === 0 ? `${n} ${units[u]}` : `${v.toFixed(1)} ${units[u]}`;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  gui: 'App GUI',
  terminal: 'Terminal',
  aur: 'AUR',
  flatpak: 'Flatpak',
  snap: 'Snap',
  all: 'Todas',
};

export const CATEGORY_ORDER: Category[] = ['gui', 'terminal', 'aur', 'flatpak', 'snap'];

export function categoryColor(c: Category): string {
  switch (c) {
    case 'gui':
      return 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30';
    case 'terminal':
      return 'text-violet-300 bg-violet-500/10 border-violet-500/30';
    case 'aur':
      return 'text-amber-300 bg-amber-500/10 border-amber-500/30';
    case 'flatpak':
      return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
    case 'snap':
      return 'text-orange-300 bg-orange-500/10 border-orange-500/30';
    default:
      return 'text-slate-300 bg-slate-500/10 border-slate-500/30';
  }
}

export function managerLabel(m: string): string {
  switch (m) {
    case 'pacman':
      return 'pacman';
    case 'yay':
      return 'yay';
    case 'paru':
      return 'paru';
    case 'apt':
      return 'apt';
    case 'dnf':
      return 'dnf';
    case 'zypper':
      return 'zypper';
    default:
      return m;
  }
}

export const SECTION_LABEL: Record<Section, string> = {
  sistema: 'Sistema',
  utilidades: 'Utilidades',
  internet: 'Internet',
  desarrollo: 'Desarrollo',
  multimedia: 'Multimedia',
  graficos: 'Gráficos',
  juegos: 'Juegos',
  ofimatica: 'Ofimática',
  educacion: 'Educación',
  configuracion: 'Configuración',
  otras: 'Otras',
};

export const SECTION_ORDER: Section[] = [
  'sistema',
  'utilidades',
  'internet',
  'desarrollo',
  'multimedia',
  'graficos',
  'juegos',
  'ofimatica',
  'educacion',
  'configuracion',
  'otras',
];

export function sectionColor(s: Section): string {
  switch (s) {
    case 'sistema':
      return 'text-sky-300 bg-sky-500/10 border-sky-500/30';
    case 'utilidades':
      return 'text-slate-300 bg-slate-500/10 border-slate-500/30';
    case 'internet':
      return 'text-blue-300 bg-blue-500/10 border-blue-500/30';
    case 'desarrollo':
      return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
    case 'multimedia':
      return 'text-pink-300 bg-pink-500/10 border-pink-500/30';
    case 'graficos':
      return 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/30';
    case 'juegos':
      return 'text-purple-300 bg-purple-500/10 border-purple-500/30';
    case 'ofimatica':
      return 'text-teal-300 bg-teal-500/10 border-teal-500/30';
    case 'educacion':
      return 'text-amber-300 bg-amber-500/10 border-amber-500/30';
    case 'configuracion':
      return 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30';
    default:
      return 'text-orange-300 bg-orange-500/10 border-orange-500/30';
  }
}

export const SECTION_ICON: Record<Section, string> = {
  sistema:
    'M8 3v2M16 3v2M8 21v-2M16 21v-2M3 8h2M3 16h2M21 8h-2M21 16h-2M7 7h10v10H7z',
  utilidades:
    'M14.7 6.3a4.5 4.5 0 00-6.2 6.2L3 18v3h3l5.5-5.5a4.5 4.5 0 006.2-6.2L15 12l-3-3 2.7-2.7z',
  internet:
    'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18',
  desarrollo: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  multimedia:
    'M3 5h18v14H3zM7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4',
  graficos:
    'M4 5h16v14H4zM9 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM20 15l-5-5L5 20',
  juegos:
    'M6 11h4M8 9v4M14.5 10h.01M17.5 12.5h.01M17.3 5H6.7a4 4 0 00-4 4.6L4 19a2 2 0 004 1l3-3h2.1l3 3a2 2 0 004-1l1.3-9.4a4 4 0 00-4-4.6z',
  ofimatica: 'M6 4h8l4 4v12H6zM14 4v4h4',
  educacion: 'M22 9L12 4 2 9l10 5 10-5zM6 11v5c0 1 2.7 3 6 3s6-2 6-3v-5M22 9v5',
  configuracion:
    'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  otras: 'M21 8l-9-5-9 5v8l9 5 9-5v-8zM3 8l9 5 9-5M12 13v8',
};

interface SectionRule {
  section: Section;
  words: string[];
  subs: string[];
}

const SECTION_RULES: SectionRule[] = [
  {
    section: 'juegos',
    words: ['game', 'steam', 'lutris', 'wine', 'emulator'],
    subs: ['dolphin-emu', 'gamemode', 'mangohud', 'prismlauncher', 'heroic', 'ryujinx', 'proton', 'overlay'],
  },
  {
    section: 'desarrollo',
    words: [
      'git', 'cmake', 'gcc', 'clang', 'cargo', 'rust', 'go', 'java', 'node', 'npm', 'python',
      'gdb', 'valgrind', 'ansible', 'terraform', 'docker', 'kubernetes', 'compiler', 'build',
      'debug', 'development', 'programming', 'devel',
    ],
    subs: ['nodejs', 'postgres', 'sqlite', 'opencode', 'yarn', 'gradle', 'maven', 'patchelf', 'kubectl'],
  },
  {
    section: 'multimedia',
    words: ['audio', 'video', 'music', 'media', 'player', 'recorder', 'mixer', 'stream', 'podcast'],
    subs: ['ffmpeg', 'mpv', 'vlc', 'gstreamer', 'gst', 'pulseaudio', 'pipewire', 'alsa', 'jack', 'codec', 'flac', 'ogg', 'mpg', 'mkv', 'webm'],
  },
  {
    section: 'sistema',
    words: [
      'system', 'kernel', 'firmware', 'boot', 'init', 'login', 'display manager', 'daemon',
      'service', 'filesystem', 'disk', 'partition', 'mount', 'cpu', 'gpu', 'virtual', 'container',
      'driver', 'linux', 'base',
    ],
    subs: [
      'systemd', 'grub', 'efibootmgr', 'refind', 'os-prober', 'sddm', 'intel-ucode', 'zram',
      'timeshift', 'testdisk', 'dosfstools', 'ntfs-3g', 'pacman', 'yay', 'paru', 'kwallet-pam',
      'cryptsetup', 'lvm2', 'btrfs', 'xfsprogs', 'gparted', 'fastfetch', 'htop', 'ncdu', 'btop',
      'dmidecode', 'lsblk', 'fdisk', 'sysctl', 'systemctl', 'journalctl', 'virtualbox', 'qemu',
      'libvirt', 'nvidia', 'plasma', 'ucode',
    ],
  },
  {
    section: 'graficos',
    words: ['graphics', 'image', 'photo', 'render', 'opengl', 'vulkan', 'cairo', 'x11', 'wayland'],
    subs: ['xorg', 'mesa', 'imagemagick', 'freetype', 'sdl', 'wallpaper', 'libx', 'dkms', 'xrandr', 'xdpyinfo', 'xvinfo'],
  },
  {
    section: 'internet',
    words: ['network', 'wifi', 'bluetooth', 'vpn', 'web', 'server', 'remote', 'ssh', 'dns', 'firewall', 'proxy', 'mail'],
    subs: ['networkmanager', 'nmcli', 'iproute', 'iptables', 'nftables', 'curl', 'wget', 'tailscale', 'surfshark', 'openvpn', 'wireguard', 'freerdp', 'vnc', 'samba', 'nginx', 'apache', 'hostapd', 'avahi', 'openssh', 'sshpass', 'netcat', 'socat', 'tcpdump', 'nmap', 'bluez'],
  },
  {
    section: 'ofimatica',
    words: ['office', 'word', 'spreadsheet', 'presentation', 'pdf', 'latex', 'calendar', 'writer'],
    subs: ['pandoc', 'tex', 'typesetting'],
  },
  {
    section: 'configuracion',
    words: ['config', 'setting', 'preference', 'keyboard', 'mouse', 'layout'],
    subs: ['xinput', 'xset', 'libratbag', 'piper', 'openrazer', 'polychromatic', 'xrandr', 'envycontrol'],
  },
  {
    section: 'educacion',
    words: ['education', 'learn', 'school', 'language', 'math', 'science', 'dictionary'],
    subs: [],
  },
  {
    section: 'utilidades',
    words: ['utility', 'editor', 'view', 'reader', 'archive', 'compress', 'extract', 'shell', 'terminal', 'search', 'note', 'util'],
    subs: [
      'zip', 'unzip', '7zip', 'unrar', 'rar', 'tar', 'gzip', 'bzip', 'xz', 'zstd', 'base64',
      'nano', 'vim', 'neovim', 'micro', 'diff', 'grep', 'findutils', 'coreutils', 'bash', 'zsh',
      'fish', 'screen', 'tmux', 'xdotool', 'mtools', 'sed', 'awk', 'ripgrep', 'fzf',
    ],
  },
];

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
}

export function classifySection(pkg: { name: string; description?: string }): Section {
  const text = `${pkg.name} ${pkg.description ?? ''}`.toLowerCase();
  for (const rule of SECTION_RULES) {
    if (rule.words.some((w) => hasWord(text, w))) return rule.section;
    if (rule.subs.some((s) => text.includes(s))) return rule.section;
  }
  return 'otras';
}