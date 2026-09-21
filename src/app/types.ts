export interface SystemInfo {
  os: string;
  distro: string;
  distroLike: string;
  versionId: string;
  prettyName: string;
  kernel: string;
  arch: string;
  hostname: string;
  desktop: string;
  session: string;
  defaultFamily: string;
}

export interface ManagerInfo {
  id: string;
  label: string;
  family: string;
  detected: boolean;
  enabled: boolean;
  note: string | null;
}

export interface Settings {
  family: string;
  managers: ManagerInfo[];
  showDependencies: boolean;
}

export interface UpdateInfo {
  newVersion: string;
  repo: string;
}

export interface Pkg {
  name: string;
  version: string;
  description: string;
  manager: string;
  category: Category;
  size: number;
  explicit: boolean;
  origin: Origin | '';
  installDate: number;
  desktopFiles: string[];
  update: UpdateInfo | null;
}

export type Category = 'gui' | 'terminal' | 'aur' | 'flatpak' | 'snap' | 'all';

export type Origin = 'sistema' | 'dependencia' | 'extra';

export type Section =
  | 'sistema'
  | 'utilidades'
  | 'internet'
  | 'desarrollo'
  | 'multimedia'
  | 'graficos'
  | 'juegos'
  | 'ofimatica'
  | 'educacion'
  | 'configuracion'
  | 'otras';

export interface ListResult {
  packages: Pkg[];
  errors: string[];
  managersUsed: string[];
}

export interface SearchResult {
  manager: string;
  name: string;
  version: string;
  description: string;
  repo: string;
  installed: boolean;
  votes: number;
  popularity: number;
  source: 'instalado' | 'repos' | 'aur' | 'flatpak' | 'snap';
  origin: Origin | '';
}

export interface PkgDetails {
  name: string;
  version: string;
  description: string;
  manager: string;
  repo: string;
  architecture: string;
  url: string;
  licenses: string[];
  groups: string[];
  provides: string[];
  depends: string[];
  optionalDeps: string[];
  requiredBy: string[];
  conflictsWith: string[];
  replaces: string[];
  downloadSize: number;
  installedSize: number;
  packager: string;
  buildDate: string;
  installDate: string;
  installReason: string;
  maintainer: string;
  submitted: string;
  modified: string;
  votes: number;
  popularity: number;
  outOfDate: boolean;
  installed: boolean;
  explicit: boolean;
  category: Category;
  origin: Origin | '';
  desktopFiles: string[];
  update: UpdateInfo | null;
}

export interface CacheInfo {
  label: string;
  path: string;
  sizeBytes: number | null;
}

export type PtsEvent =
  | { type: 'data'; id: number; data: number[] }
  | { type: 'exit'; id: number; success: boolean; code: number | null; signal: string | null };

export type OpKind = 'update' | 'upgrade' | 'install' | 'uninstall' | 'orphans' | 'cache';

export interface OpRequest {
  kind: OpKind;
  manager: string;
  packages?: string[];
}