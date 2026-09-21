use crate::model::{ListResult, Pkg, PkgDetails, SearchResult};
use crate::settings;
use crate::util::{
    command_exists, desktop_files, field_block, field_value, parse_installed_size, run_capture,
    run_capture_list, run_capture_timeout,
};
use regex::Regex;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;

type StrMap = HashMap<String, Vec<String>>;

fn enabled(app: &tauri::AppHandle, id: &str) -> bool {
    settings::load(app)
        .managers
        .iter()
        .find(|m| m.id == id)
        .map(|m| m.enabled && m.detected)
        .unwrap_or(false)
}

fn helper_id(app: &tauri::AppHandle) -> Option<String> {
    for id in ["paru", "yay"] {
        if enabled(app, id) {
            return Some(id.into());
        }
    }
    None
}

fn nat_manager_id(app: &tauri::AppHandle) -> &'static str {
    for id in ["pacman", "apt", "dnf", "zypper"] {
        if enabled(app, id) {
            return id;
        }
    }
    ""
}

pub fn list_packages(app: &tauri::AppHandle, show_deps: bool) -> ListResult {
    let fam = settings::load(app).family.clone();
    let mut result = ListResult {
        packages: vec![],
        errors: vec![],
        managers_used: vec![],
    };
    let dialer = nat_manager_id(app);

    match fam.as_str() {
        "arch" => {
            if enabled(app, "pacman") {
                result.managers_used.push("pacman".into());
                match list_arch(app, show_deps) {
                    Ok(mut p) => result.packages.append(&mut p),
                    Err(e) => result.errors.push(e),
                }
            }
        }
        "debian" => {
            if enabled(app, "apt") {
                result.managers_used.push("apt".into());
                match list_deb(show_deps) {
                    Ok(mut p) => result.packages.append(&mut p),
                    Err(e) => result.errors.push(e),
                }
            }
        }
        "fedora" | "rhel" | "suse" => {
            if enabled(app, "dnf") || enabled(app, "zypper") {
                result.managers_used.push(dialer.into());
                match list_rpm(show_deps, dialer) {
                    Ok(mut p) => result.packages.append(&mut p),
                    Err(e) => result.errors.push(e),
                }
            }
        }
        _ => result
            .errors
            .push(format!("Familia de gestores '{fam}' no soportada todavía.")),
    }

    if enabled(app, "flatpak") && command_exists("flatpak") {
        result.managers_used.push("flatpak".into());
        match list_flatpak() {
            Ok(mut p) => result.packages.append(&mut p),
            Err(e) => result.errors.push(format!("flatpak: {e}")),
        }
    }
    if enabled(app, "snap") && command_exists("snap") {
        result.managers_used.push("snap".into());
        match list_snap() {
            Ok(mut p) => result.packages.append(&mut p),
            Err(e) => result.errors.push(format!("snap: {e}")),
        }
    }

    result
}

#[derive(Debug, Clone, Default)]
struct ArchInfo {
    desc: String,
    size: i64,
    groups: Vec<String>,
    depends: Vec<String>,
}

/// Cierre de dependencias del sistema base: `base` + núcleos instalados y
/// todo lo que necesitan (recursivo). Son los paquetes "necesarios para el SO".
fn system_closure(info: &HashMap<String, ArchInfo>) -> HashSet<String> {
    let mut roots: Vec<String> = Vec::new();
    if info.contains_key("base") {
        roots.push("base".to_string());
    }
    for name in info.keys() {
        if name == "linux" || name.starts_with("linux-") || name.starts_with("linux_") {
            roots.push(name.clone());
        }
    }
    let mut seen: HashSet<String> = HashSet::new();
    let mut stack = roots;
    while let Some(n) = stack.pop() {
        if !seen.insert(n.clone()) {
            continue;
        }
        if let Some(ai) = info.get(&n) {
            for d in &ai.depends {
                if info.contains_key(d) {
                    stack.push(d.clone());
                }
            }
        }
    }
    seen
}

/// Origen de un paquete Arch: "sistema" (grupo base o dentro del cierre del
/// sistema), "extra" (extranjero/AUR o explícito de usuario) o "dependencia".
fn arch_origin(is_foreign: bool, is_explicit: bool, groups: &[String], in_system: bool) -> &'static str {
    if is_foreign {
        "extra"
    } else if in_system || groups.iter().any(|g| g == "base" || g == "base-devel") {
        "sistema"
    } else if is_explicit {
        "extra"
    } else {
        "dependencia"
    }
}

/// Normaliza una entrada de "Depends On": quita restricciones (`glibc>=2.33`).
fn dep_name(token: &str) -> Option<String> {
    let n = token.split(['=', '<', '>']).next().unwrap_or("").trim();
    if n.is_empty() || n.eq_ignore_ascii_case("none") {
        None
    } else {
        Some(n.to_string())
    }
}

fn arch_info_map() -> HashMap<String, ArchInfo> {
    let info_raw = run_capture("pacman", &["-Qi"]).stdout;
    let mut info: HashMap<String, ArchInfo> = HashMap::new();
    for block in info_raw.split("\n\n") {
        if let Some(name) = field_value(block, "Name") {
            let desc = field_value(block, "Description").unwrap_or_default();
            let size = field_value(block, "Installed Size")
                .map(|s| parse_installed_size(&s))
                .unwrap_or(0);
            let groups = field_value(block, "Groups")
                .map(|g| {
                    g.split_whitespace()
                        .filter(|w| !w.eq_ignore_ascii_case("none"))
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default();
            let depends = field_block(block, "Depends On")
                .map(|d| d.split_whitespace().filter_map(dep_name).collect())
                .unwrap_or_default();
            info.insert(name, ArchInfo { desc, size, groups, depends });
        }
    }
    info
}

fn list_arch(app: &tauri::AppHandle, show_deps: bool) -> Result<Vec<Pkg>, String> {
    let all = run_capture("pacman", &["-Q"]).stdout;
    let explicit: HashSet<String> = run_capture("pacman", &["-Qe", "-q"])
        .stdout
        .lines()
        .map(str::to_string)
        .collect();
    let foreign: HashSet<String> = run_capture("pacman", &["-Qm", "-q"])
        .stdout
        .lines()
        .map(str::to_string)
        .collect();

    let info = arch_info_map();

    let gui = desktop_owners_arch();
    let helper = helper_id(app);
    let sys = system_closure(&info);

    let mut out = Vec::new();
    for line in all.lines() {
        let mut parts = line.splitn(2, char::is_whitespace);
        let Some(name) = parts.next() else { continue };
        let name = name.trim();
        if name.is_empty() {
            continue;
        }
        let version = parts.next().unwrap_or("").trim().to_string();
        let ai = info.get(name).cloned().unwrap_or_default();
        let is_foreign = foreign.contains(name);
        let is_gui = gui.contains_key(name);
        let is_explicit = explicit.contains(name);
        if !show_deps && !is_explicit && !is_foreign && !is_gui {
            continue;
        }
        let category = if is_foreign {
            "aur".into()
        } else if is_gui {
            "gui".into()
        } else {
            "terminal".into()
        };
        let manager = if category == "aur" {
            helper.clone().unwrap_or_else(|| "pacman".into())
        } else {
            "pacman".into()
        };
        let desktop = gui.get(name).cloned().unwrap_or_default();
        out.push(Pkg {
            name: name.to_string(),
            version,
            description: ai.desc,
            manager,
            category,
            size: ai.size,
            explicit: is_explicit || is_foreign,
            origin: arch_origin(is_foreign, is_explicit, &ai.groups, sys.contains(name)).into(),
            desktop_files: desktop,
            update: None,
        });
    }
    Ok(out)
}

fn list_deb(show_deps: bool) -> Result<Vec<Pkg>, String> {
    let all = run_capture(
        "dpkg-query",
        &["-W", "-f=${db:Status-Abbrev}\\t${binary:Package}\\t${Version}\\t${Installed-Size}\\t${binary:Synopsis}\\n"],
    );
    let manual: HashSet<String> = run_capture("apt-mark", &["showmanual"])
        .stdout
        .lines()
        .map(str::to_string)
        .collect();
    let gui = desktop_owners_deb();

    let mut out = Vec::new();
    for line in all.stdout.lines() {
        let mut p = line.split('\t');
        let status = p.next().unwrap_or("");
        if !status.starts_with("ii") {
            continue;
        }
        let (name, version) = (p.next().unwrap_or(""), p.next().unwrap_or(""));
        let size_kb: f64 = p.next().unwrap_or("0").parse().unwrap_or(0.0);
        let desc = p.next().unwrap_or("").to_string();
        let is_gui = gui.contains_key(name);
        let is_explicit = manual.contains(name) || gui.contains_key(name);
        if !show_deps && !is_explicit {
            continue;
        }
        if name.is_empty() {
            continue;
        }
        out.push(Pkg {
            name: name.into(),
            version: version.into(),
            description: desc,
            manager: "apt".into(),
            category: if is_gui {
                "gui".into()
            } else {
                "terminal".into()
            },
            size: (size_kb * 1024.0) as i64,
            explicit: is_explicit,
            desktop_files: gui.get(name).cloned().unwrap_or_default(),
            update: None,

            origin: String::new(),
        });
    }
    Ok(out)
}

fn list_rpm(show_deps: bool, dialer: &str) -> Result<Vec<Pkg>, String> {
    let all = run_capture(
        "rpm",
        &[
            "-qa",
            "--queryformat=%{NAME}\\t%{VERSION}-%{RELEASE}\\t%{SIZE}\\t%{SUMMARY}\\n",
        ],
    );
    let mut manual: HashSet<String> = HashSet::new();
    let u = run_capture("rpm", &["-qa", "--userinstalled"]);
    if u.code == Some(0) {
        manual = u.stdout.lines().map(str::to_string).collect();
    }
    let gui = desktop_owners_rpm();
    let show_all = manual.is_empty();

    let mut out = Vec::new();
    for line in all.stdout.lines() {
        let mut p = line.split('\t');
        let name = p.next().unwrap_or("").to_string();
        let version = p.next().unwrap_or("").to_string();
        let size: i64 = p.next().unwrap_or("0").parse().unwrap_or(0);
        let desc = p.next().unwrap_or("").to_string();
        if name.is_empty() {
            continue;
        }
        let is_gui = gui.contains_key(&name);
        let is_explicit = manual.contains(&name) || is_gui || show_all;
        if !show_deps && !is_explicit {
            continue;
        }
        let desktop = gui.get(&name).cloned().unwrap_or_default();
        out.push(Pkg {
            name: name.clone(),
            version,
            description: desc,
            manager: dialer.into(),
            category: if is_gui {
                "gui".into()
            } else {
                "terminal".into()
            },
            size,
            explicit: is_explicit,
            desktop_files: desktop,
            update: None,

            origin: String::new(),
        });
    }
    Ok(out)
}

fn list_flatpak() -> Result<Vec<Pkg>, String> {
    let o = run_capture(
        "flatpak",
        &[
            "list",
            "--app",
            "--columns=application,name,version,origin,ref",
        ],
    );
    if o.code == Some(1) && o.stdout.is_empty() && o.stderr.contains("No usable remotes") {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for line in o.stdout.lines() {
        let mut p = line.split('\t');
        let app = p.next().unwrap_or("").trim();
        let name = p.next().unwrap_or("").trim();
        let version = p.next().unwrap_or("").trim();
        let origin = p.next().unwrap_or("").trim();
        if app.is_empty() {
            continue;
        }
        out.push(Pkg {
            name: app.into(),
            version: version.into(),
            description: if name.is_empty() {
                app.into()
            } else {
                name.into()
            },
            manager: "flatpak".into(),
            category: "flatpak".into(),
            size: 0,
            explicit: true,
            origin: String::new(),
            desktop_files: vec![],
            update: None,
        });
    }
    Ok(out)
}

fn list_snap() -> Result<Vec<Pkg>, String> {
    let o = run_capture("snap", &["list"]);
    let mut out = Vec::new();
    for line in o.stdout.lines().skip(1) {
        let mut t = line.split_whitespace();
        let name = t.next().unwrap_or("").to_string();
        let version = t.next().unwrap_or("").to_string();
        if name.is_empty() || name == "Name" {
            continue;
        }
        out.push(Pkg {
            name,
            version,
            description: String::new(),
            manager: "snap".into(),
            category: "snap".into(),
            size: 0,
            explicit: true,
            desktop_files: vec![],
            update: None,

            origin: String::new(),
        });
    }
    Ok(out)
}

fn desktop_owners_arch() -> StrMap {
    let files = desktop_files();
    let mut map: StrMap = HashMap::new();
    for chunk in files.chunks(250) {
        let args: Vec<String> = std::iter::once("Qo".into())
            .chain(
                chunk
                    .iter()
                    .filter_map(|p| p.to_str().map(|s| s.to_string())),
            )
            .collect();
        if args.len() <= 1 {
            continue;
        }
        let o = run_capture_list("pacman", args);
        for line in o.stdout.lines() {
            if let Some(pair) = line.split_once(" is owned by ") {
                let pkg = pair.1.split_whitespace().next().unwrap_or("").to_string();
                let path = pair.0.trim();
                if pkg.is_empty() || path.is_empty() {
                    continue;
                }
                if let Some(base) = Path::new(path).file_name().and_then(|s| s.to_str()) {
                    let base = base.strip_suffix(".desktop").unwrap_or(base).to_string();
                    map.entry(pkg).or_default().push(base);
                }
            }
        }
    }
    map
}

fn desktop_owners_deb() -> StrMap {
    let files = desktop_files();
    let mut map: StrMap = HashMap::new();
    for chunk in files.chunks(120) {
        let args: Vec<String> = std::iter::once("S".into())
            .chain(
                chunk
                    .iter()
                    .filter_map(|p| p.to_str().map(|s| s.to_string())),
            )
            .collect();
        if args.len() <= 1 {
            continue;
        }
        let o = run_capture_list("dpkg-query", args);
        for line in o.stdout.lines() {
            if let Some((pkg, path)) = line.split_once(':') {
                let pkg = pkg.trim().to_string();
                if let Some(base) = Path::new(path.trim()).file_name().and_then(|s| s.to_str()) {
                    map.entry(pkg)
                        .or_default()
                        .push(base.strip_suffix(".desktop").unwrap_or(base).to_string());
                }
            }
        }
    }
    map
}

fn desktop_owners_rpm() -> StrMap {
    let files = desktop_files();
    let mut map: StrMap = HashMap::new();
    for f in &files {
        let o = run_capture("rpm", &["-qf", f.to_str().unwrap_or("")]);
        if o.code != Some(0) {
            continue;
        }
        if let Some(base) = f.file_name().and_then(|s| s.to_str()) {
            map.entry(o.stdout.trim().to_string())
                .or_default()
                .push(base.strip_suffix(".desktop").unwrap_or(base).to_string());
        }
    }
    map
}

// ---------------- Updates ----------------

pub fn list_updates(app: &tauri::AppHandle, manager: &str) -> Result<Vec<Pkg>, String> {
    let mut v = match manager {
        "pacman" => arch_updates(app, false)?,
        "yay" | "paru" => arch_updates(app, true)?,
        "apt" => deb_updates()?,
        "dnf" => dnf_updates()?,
        "zypper" => zypper_updates()?,
        "flatpak" => flatpak_updates()?,
        "snap" => snap_updates()?,
        _ => return Err(format!("Gestor '{manager}' no soportado")),
    };
    let fam = settings::load(app).family;
    for p in v.iter_mut() {
        let (category, man) = if manager == "flatpak" {
            ("flatpak", "flatpak")
        } else if manager == "snap" {
            ("snap", "snap")
        } else if fam == "arch" {
            ("aur", manager)
        } else {
            ("terminal", manager)
        };
        p.category = category.into();
        p.manager = man.into();
    }
    Ok(v)
}

fn arch_updates(_app: &tauri::AppHandle, use_helper: bool) -> Result<Vec<Pkg>, String> {
    let out = if use_helper {
        let h = if command_exists("paru") {
            "paru"
        } else {
            "yay"
        };
        run_capture(h, &["-Qu"]).stdout
    } else if command_exists("checkupdates") {
        run_capture("checkupdates", &[]).stdout
    } else {
        // refresh sync db as root (timestamp cacheado) y consulta
        if crate::sudo::ok_now() {
            let _ = run_capture("sudo", &["-n", "pacman", "-Sy", "--noconfirm"]);
            run_capture("pacman", &["-Qu"]).stdout
        } else {
            return Ok(Vec::new());
        }
    };
    let re = Regex::new(
        r"(?m)^(?P<repo>[\w+.-]+/)?(?P<name>[\w+.-]+?)\s+(?P<cur>\S+)\s*->\s*(?P<new>\S+)",
    )
    .unwrap();
    let mut v = Vec::new();
    for caps in re.captures_iter(&out) {
        let repo = caps
            .name("repo")
            .map(|m| m.as_str().trim_end_matches('/').to_string())
            .unwrap_or_else(|| "".into());
        v.push(Pkg {
            name: caps["name"].to_string(),
            version: caps["cur"].to_string(),
            description: String::new(),
            manager: String::new(),
            category: String::new(),
            size: 0,
            explicit: true,
            desktop_files: vec![],
            update: Some(crate::model::UpdateInfo {
                new_version: caps["new"].to_string(),
                repo,
            }),

            origin: String::new(),
        });
    }
    Ok(v)
}

fn deb_updates() -> Result<Vec<Pkg>, String> {
    let o = run_capture("apt", &["list", "--upgradable"]);
    let re = Regex::new(r"^(\S+)/([^\s]+)\s+(\S+)\s+\S+\s+\[upgradable from:\s+(\S+)\]").unwrap();
    let mut v = Vec::new();
    for line in o.stdout.lines() {
        if !line.contains("[upgradable from:") {
            continue;
        }
        if let Some(caps) = re.captures(line) {
            v.push(Pkg {
                name: caps[1].to_string(),
                version: caps[4].to_string(),
                description: String::new(),
                manager: "apt".into(),
                category: String::new(),
                size: 0,
                explicit: true,
                desktop_files: vec![],
                update: Some(crate::model::UpdateInfo {
                    new_version: caps[3].to_string(),
                    repo: caps[2].to_string(),
                }),

                origin: String::new(),
            });
        }
    }
    Ok(v)
}

fn dnf_updates() -> Result<Vec<Pkg>, String> {
    let o = run_capture("dnf", &["check-update", "--quiet"]);
    let mut v = Vec::new();
    for line in o.stdout.lines() {
        let mut t = line.split_whitespace();
        let name = t.next().unwrap_or("");
        let ver = t.next().unwrap_or("");
        let repo = t.next().unwrap_or("");
        if name.is_empty() || repo.is_empty() || ver.contains('/') {
            continue;
        }
        v.push(Pkg {
            name: name.into(),
            version: ver.into(),
            description: String::new(),
            manager: "dnf".into(),
            category: String::new(),
            size: 0,
            explicit: true,
            desktop_files: vec![],
            update: Some(crate::model::UpdateInfo {
                new_version: ver.into(),
                repo: repo.into(),
            }),

            origin: String::new(),
        });
    }
    Ok(v)
}

fn zypper_updates() -> Result<Vec<Pkg>, String> {
    let o = run_capture("zypper", &["-q", "list-updates"]);
    let mut v = Vec::new();
    for line in o.stdout.lines() {
        let t: Vec<&str> = line.split('|').map(|s| s.trim()).collect();
        if t.len() >= 3 && !t[1].is_empty() && !t[1].contains(' ') && t[0] != "S" && t[0] != "" {
            v.push(Pkg {
                name: t[1].into(),
                version: String::new(),
                description: String::new(),
                manager: "zypper".into(),
                category: String::new(),
                size: 0,
                explicit: true,
                desktop_files: vec![],
                update: Some(crate::model::UpdateInfo {
                    new_version: String::new(),
                    repo: t[2].into(),
                }),

                origin: String::new(),
            });
        }
    }
    Ok(v)
}

fn flatpak_updates() -> Result<Vec<Pkg>, String> {
    let o = run_capture(
        "flatpak",
        &[
            "remote-ls",
            "--updates",
            "--columns=application,name,version,ref",
        ],
    );
    let mut v = Vec::new();
    for line in o.stdout.lines() {
        let mut p = line.split('\t').map(str::trim);
        let app = p.next().unwrap_or("");
        let name = p.next().unwrap_or("");
        let ver = p.next().unwrap_or("");
        if app.is_empty() {
            continue;
        }
        v.push(Pkg {
            name: app.into(),
            version: String::new(),
            description: if name.is_empty() {
                app.into()
            } else {
                name.into()
            },
            manager: "flatpak".into(),
            category: "flatpak".into(),
            size: 0,
            explicit: true,
            desktop_files: vec![],
            update: Some(crate::model::UpdateInfo {
                new_version: ver.into(),
                repo: String::new(),
            }),

            origin: String::new(),
        });
    }
    Ok(v)
}

fn snap_updates() -> Result<Vec<Pkg>, String> {
    let o = run_capture("snap", &["refresh", "--list"]);
    let mut v = Vec::new();
    for line in o.stdout.lines() {
        let t: Vec<&str> = line.split_whitespace().collect();
        if t.len() < 2 || t[0] == "Name" || line.contains("All snaps up to date") {
            continue;
        }
        v.push(Pkg {
            name: t[0].into(),
            version: String::new(),
            description: String::new(),
            manager: "snap".into(),
            category: "snap".into(),
            size: 0,
            explicit: true,
            desktop_files: vec![],
            update: Some(crate::model::UpdateInfo {
                new_version: t[1].into(),
                repo: String::new(),
            }),

            origin: String::new(),
        });
    }
    Ok(v)
}

// ---------------- Search ----------------

pub fn search_packages(app: &tauri::AppHandle, query: &str) -> Vec<SearchResult> {
    let mut out = Vec::new();
    let fam = settings::load(app).family;

    let installed_set: HashSet<String> = match fam.as_str() {
        "arch" => {
            if enabled(app, "pacman") {
                search_installed_arch(app, query, &mut out)
            } else {
                HashSet::new()
            }
        }
        "debian" => {
            if enabled(app, "apt") {
                search_installed_deb(query, &mut out);
            }
            HashSet::new()
        }
        "fedora" | "rhel" | "suse" => {
            let dialer = nat_manager_id(app);
            if !dialer.is_empty() {
                search_installed_rpm(query, dialer, &mut out);
            }
            HashSet::new()
        }
        _ => HashSet::new(),
    };

    if enabled(app, "flatpak") {
        search_installed_flatpak(query, &mut out);
    }
    if enabled(app, "snap") {
        search_installed_snap(query, &mut out);
    }

    if let Some(h) = helper_id(app) {
        search_repos_arch(&h, query, &installed_set, &mut out);
    } else {
        let nat = nat_manager_id(app);
        if !nat.is_empty() {
            search_repos_arch(nat, query, &installed_set, &mut out);
        }
    }
    if enabled(app, "flatpak") {
        search_flatpak(query, &mut out);
    }
    if enabled(app, "snap") {
        search_snap(query, &mut out);
    }

    finalize_results(out, query)
}

fn search_installed_arch(
    app: &tauri::AppHandle,
    query: &str,
    out: &mut Vec<SearchResult>,
) -> HashSet<String> {
    let all = run_capture("pacman", &["-Q"]).stdout;
    let info = arch_info_map();
    let foreign: HashSet<String> = run_capture("pacman", &["-Qm", "-q"])
        .stdout
        .lines()
        .map(str::to_string)
        .collect();
    let explicit: HashSet<String> = run_capture("pacman", &["-Qe", "-q"])
        .stdout
        .lines()
        .map(str::to_string)
        .collect();
    let helper = helper_id(app);
    let sys = system_closure(&info);
    let q = query.to_lowercase();
    let mut names = HashSet::new();
    for line in all.lines() {
        let mut parts = line.splitn(2, char::is_whitespace);
        let Some(name) = parts.next() else { continue };
        let name = name.trim().to_string();
        if name.is_empty() {
            continue;
        }
        names.insert(name.clone());
        let version = parts.next().unwrap_or("").trim().to_string();
        let ai = info.get(&name).cloned().unwrap_or_default();
        if !name.to_lowercase().contains(&q) && !ai.desc.to_lowercase().contains(&q) {
            continue;
        }
        let is_foreign = foreign.contains(&name);
        let manager = if is_foreign {
            helper.clone().unwrap_or_else(|| "pacman".into())
        } else {
            "pacman".into()
        };
        out.push(SearchResult {
            manager,
            name: name.clone(),
            version,
            description: ai.desc,
            repo: String::new(),
            installed: true,
            votes: 0,
            popularity: 0.0,
            source: if is_foreign {
                "aur".into()
            } else {
                "instalado".into()
            },
            origin: arch_origin(is_foreign, explicit.contains(&name), &ai.groups, sys.contains(&name)).into(),
        });
    }
    names
}

fn search_installed_deb(query: &str, out: &mut Vec<SearchResult>) {
    let all = run_capture(
        "dpkg-query",
        &[
            "-W",
            "-f=${binary:Package}\t${Version}\t${binary:Synopsis}\n",
        ],
    )
    .stdout;
    let q = query.to_lowercase();
    for line in all.lines() {
        let mut p = line.split('\t');
        let Some(name) = p.next() else { continue };
        let name = name.trim().to_string();
        if name.is_empty() {
            continue;
        }
        let version = p.next().unwrap_or("").trim().to_string();
        let desc = p.next().unwrap_or("").trim().to_string();
        if !name.to_lowercase().contains(&q) && !desc.to_lowercase().contains(&q) {
            continue;
        }
        out.push(SearchResult {
            manager: "apt".into(),
            name,
            version,
            description: desc,
            repo: String::new(),
            installed: true,
            votes: 0,
            popularity: 0.0,
            source: "instalado".into(),

            origin: String::new(),
        });
    }
}

fn search_installed_rpm(query: &str, dialer: &str, out: &mut Vec<SearchResult>) {
    let all = run_capture(
        "rpm",
        &[
            "-qa",
            "--queryformat=%{NAME}\t%{VERSION}-%{RELEASE}\t%{SUMMARY}\n",
        ],
    )
    .stdout;
    let q = query.to_lowercase();
    for line in all.lines() {
        let mut p = line.split('\t');
        let (name, version, desc) = (
            p.next().unwrap_or("").trim().to_string(),
            p.next().unwrap_or("").trim().to_string(),
            p.next().unwrap_or("").trim().to_string(),
        );
        if name.is_empty() {
            continue;
        }
        if !name.to_lowercase().contains(&q) && !desc.to_lowercase().contains(&q) {
            continue;
        }
        out.push(SearchResult {
            manager: dialer.into(),
            name,
            version,
            description: desc,
            repo: String::new(),
            installed: true,
            votes: 0,
            popularity: 0.0,
            source: "instalado".into(),

            origin: String::new(),
        });
    }
}

fn search_installed_flatpak(query: &str, out: &mut Vec<SearchResult>) {
    let o = run_capture(
        "flatpak",
        &["list", "--app", "--columns=application,name,version"],
    )
    .stdout;
    let q = query.to_lowercase();
    for line in o.lines() {
        let p: Vec<&str> = line.split('\t').collect();
        let Some(name) = p.first().map(|s| s.trim().to_string()) else {
            continue;
        };
        if name.is_empty() {
            continue;
        }
        let title = p.get(1).map(|s| s.trim()).unwrap_or("").to_string();
        if !name.to_lowercase().contains(&q) && !title.to_lowercase().contains(&q) {
            continue;
        }
        let description = if title.is_empty() {
            name.clone()
        } else {
            title.clone()
        };
        out.push(SearchResult {
            manager: "flatpak".into(),
            name: name.clone(),
            version: p.get(2).map(|s| s.trim().to_string()).unwrap_or_default(),
            description,
            repo: "flatpak".into(),
            installed: true,
            votes: 0,
            popularity: 0.0,
            source: "flatpak".into(),

            origin: String::new(),
        });
    }
}

fn search_installed_snap(query: &str, out: &mut Vec<SearchResult>) {
    let o = run_capture("snap", &["list"]).stdout;
    let q = query.to_lowercase();
    for line in o.lines().skip(1) {
        let t: Vec<&str> = line.split_whitespace().collect();
        if t.len() < 2 {
            continue;
        }
        let name = t[0];
        if !name.to_lowercase().contains(&q) {
            continue;
        }
        out.push(SearchResult {
            manager: "snap".into(),
            name: name.into(),
            version: t.get(1).map(|s| s.to_string()).unwrap_or_default(),
            description: String::new(),
            repo: String::new(),
            installed: true,
            votes: 0,
            popularity: 0.0,
            source: "snap".into(),

            origin: String::new(),
        });
    }
}

fn search_repos_arch(
    bin: &str,
    query: &str,
    installed: &HashSet<String>,
    out: &mut Vec<SearchResult>,
) {
    let o = run_capture(bin, &["-Ss", query]);
    let header = Regex::new(
    // yay v13 añade un corchete de antigüedad tras los votos: `aur/nombre ver (+N pop) [307d16h]`.
    // Se acepta como opcional (el flag `installed` no sale de aquí sino del HashSet).
        r"^(?P<repo>[^\s/]+)/(?P<name>[^\s]+?)\s+(?P<ver>\S+)(?:\s+\((?:[+-](?P<votes>\d+)\s+(?P<pop>[\d.]+))\))?(?:\s+\[[^\]]*\])?(?:\s+\(Out-of-date:\s*[^)]*\))?(?:\s+\[installed\])?\s*$",
    )
    .unwrap();
    let mut pending: Option<SearchResult> = None;
    for line in o.stdout.lines() {
        if let Some(caps) = header.captures(line) {
            dedupe_push(out, pending.take());
            let repo = caps["repo"].to_string();
            let name = caps["name"].to_string();
            let votes: i64 = caps
                .name("votes")
                .map(|m| m.as_str().parse().unwrap_or(0))
                .unwrap_or(0);
            let pop: f64 = caps
                .name("pop")
                .map(|m| m.as_str().parse().unwrap_or(0.0))
                .unwrap_or(0.0);
            let source = if repo == "aur" { "aur" } else { "repos" };
            // Solo los paquetes de AUR se gestionan con el helper; los de
            // repos nativos van con pacman aunque los haya listado yay.
            // Así el detalle abre /programas/pacman/<nombre> (repo y
            // acciones correctos) y el dedupe por (manager, nombre) fusiona
            // la entrada instalada con la del repo en vez de duplicarla.
            let entry_manager = if repo == "aur" { bin } else { "pacman" };
            pending = Some(SearchResult {
                manager: entry_manager.into(),
                name: name.clone(),
                version: caps["ver"].to_string(),
                description: String::new(),
                repo: repo.clone(),
                installed: installed.contains(&name),
                votes,
                popularity: pop,
                source: source.into(),

                origin: String::new(),
            });
        } else if line.starts_with(char::is_whitespace) && pending.is_some() {
            if let Some(s) = pending.as_mut() {
                if s.description.is_empty() {
                    let d = line.trim();
                    if !d.is_empty() && !d.starts_with("==") && !line.starts_with('\u{2581}') {
                        s.description = d.to_string();
                    }
                }
            }
        }
    }
    dedupe_push(out, pending.take());
}

fn search_flatpak(query: &str, out: &mut Vec<SearchResult>) {
    let o = run_capture(
        "flatpak",
        &[
            "search",
            "--columns=application,name,version,description",
            query,
        ],
    );
    for line in o.stdout.lines() {
        let p: Vec<&str> = line.split('\t').collect();
        if p.len() < 3 {
            continue;
        }
        out.push(SearchResult {
            manager: "flatpak".into(),
            name: p[0].trim().into(),
            version: p.get(2).map(|s| s.trim()).unwrap_or("").into(),
            description: p
                .get(3)
                .map(|s| s.trim().to_string())
                .unwrap_or_else(|| p.get(1).map(|s| s.trim().to_string()).unwrap_or_default()),
            repo: p.get(1).map(|s| s.trim().to_string()).unwrap_or_default(),
            installed: false,
            votes: 0,
            popularity: 0.0,
            source: "flatpak".into(),

            origin: String::new(),
        });
    }
}

fn search_snap(query: &str, out: &mut Vec<SearchResult>) {
    let o = run_capture("snap", &["find", query]);
    for line in o.stdout.lines().skip(1) {
        let t: Vec<&str> = line.split_whitespace().collect();
        if t.len() < 3 || t[0] == "No" {
            continue;
        }
        out.push(SearchResult {
            manager: "snap".into(),
            name: t[0].into(),
            version: t.get(1).map(|s| s.to_string()).unwrap_or_default(),
            description: t.get(4..).map(|s| s.join(" ")).unwrap_or_default(),
            repo: t.get(3).map(|s| s.to_string()).unwrap_or_default(),
            installed: false,
            votes: 0,
            popularity: 0.0,
            source: "snap".into(),

            origin: String::new(),
        });
    }
}

fn dedupe_push(out: &mut Vec<SearchResult>, r: Option<SearchResult>) {
    let Some(r) = r else { return };
    if !out.iter().any(|x| {
        x.manager == r.manager && x.name == r.name && x.repo == r.repo && x.source == r.source
    }) {
        out.push(r);
    }
}

fn rank(q: &str, r: &SearchResult) -> i64 {
    let n = r.name.to_lowercase();
    let d = r.description.to_lowercase();
    let mut score = if n == q {
        1000
    } else if n.starts_with(q) {
        500
    } else if n.contains(q) {
        200
    } else if d.contains(q) {
        100
    } else {
        0
    };
    if r.installed {
        score += 20;
    }
    score
}

fn finalize_results(mut out: Vec<SearchResult>, query: &str) -> Vec<SearchResult> {
    let q = query.to_lowercase();
    let mut with_rank: Vec<(i64, bool, String, SearchResult)> = out
        .drain(..)
        .map(|r| (rank(&q, &r), r.installed, r.name.clone(), r))
        .collect();
    with_rank.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.2.cmp(&b.2)));
    let mut seen: HashSet<(String, String)> = HashSet::new();
    let mut kept: Vec<SearchResult> = Vec::new();
    for (_, _, _, r) in with_rank {
        if seen.insert((r.manager.clone(), r.name.clone())) {
            kept.push(r);
        }
    }
    kept.sort_by(|a, b| {
        let ra = rank(&q, a);
        let rb = rank(&q, b);
        rb.cmp(&ra).then_with(|| a.name.cmp(&b.name))
    });
    kept.truncate(120);
    kept
}

// ---------------- Detalles ----------------

fn list(v: Option<String>) -> Vec<String> {
    let mut seen: Vec<String> = Vec::new();
    if let Some(s) = v {
        for t in s.split_whitespace() {
            if t.is_empty() || t.eq_ignore_ascii_case("none") {
                continue;
            }
            if !seen.iter().any(|x| x == t) {
                seen.push(t.to_string());
            }
        }
    }
    seen
}

pub fn package_details(
    app: &tauri::AppHandle,
    manager: &str,
    name: &str,
) -> Result<PkgDetails, String> {
    match manager {
        "pacman" | "yay" | "paru" => arch_details(app, manager, name),
        "apt" => deb_details(name),
        "dnf" | "zypper" => rpm_details(manager, name),
        "flatpak" => flatpak_details(name),
        "snap" => snap_details(name),
        _ => Err(format!("Gestor '{manager}' no soportado para detalles")),
    }
}

fn arch_details(app: &tauri::AppHandle, manager: &str, name: &str) -> Result<PkgDetails, String> {
    let q = run_capture("pacman", &["-Q", name]);
    let installed = q.code == Some(0);
    let foreign: HashSet<String> = run_capture("pacman", &["-Qm", "-q"])
        .stdout
        .lines()
        .map(str::to_string)
        .collect();
    let is_foreign = installed && foreign.contains(name);
    let is_aur = manager == "yay" || manager == "paru" || is_foreign;

    let rpc = if is_aur { aur_rpc(name) } else { None };

    let (block, is_remote) = if installed {
        (run_capture("pacman", &["-Qi", name]).stdout, false)
    } else if manager == "pacman" {
        if rpc.is_none() {
            (run_capture("pacman", &["-Si", name]).stdout, true)
        } else {
            (String::new(), true)
        }
    } else {
        let active = settings::load(app)
            .managers
            .iter()
            .any(|m| m.id == manager && m.enabled && m.detected);
        let bin = if active { manager } else { "pacman" };
        if rpc.is_some() {
            (String::new(), true)
        } else {
            (run_capture_timeout(bin, &["-Si", name], 15).stdout, true)
        }
    };

    if block.trim().is_empty() && rpc.is_none() {
        return Err(format!("No se encontró información de '{name}'"));
    }

    let manager_used = if installed && is_foreign {
        helper_id(app).unwrap_or_else(|| "pacman".into())
    } else {
        manager.to_string()
    };

    let r = rpc.as_ref();
    let f_desc = field_value(&block, "Description");
    let f_version = field_value(&block, "Version");
    let f_name = field_value(&block, "Name");
    let f_url = field_value(&block, "URL");
    let f_lic = field_value(&block, "Licenses");
    let f_dep = field_value(&block, "Depends On");
    let f_opt = field_value(&block, "Optional Deps");
    let f_prov = field_value(&block, "Provides");
    let f_conf = field_value(&block, "Conflicts With");
    let f_rep = field_value(&block, "Repository");
    let f_votes = field_value(&block, "Votes").and_then(|s| s.parse::<i64>().ok());
    let f_pop = field_value(&block, "Popularity").and_then(|s| s.parse::<f64>().ok());
    let ood = field_value(&block, "Out-of-date")
        .map(|v| v.trim().eq_ignore_ascii_case("yes"))
        .unwrap_or(false);

    let mut d = PkgDetails {
        name: f_name
            .or_else(|| r.map(|r| r.name.clone()))
            .unwrap_or_else(|| name.to_string()),
        version: f_version
            .or_else(|| r.map(|r| r.version.clone()))
            .unwrap_or_default(),
        description: f_desc
            .or_else(|| r.map(|r| r.description.clone()))
            .unwrap_or_default(),
        manager: manager_used,
        repo: f_rep
            .or_else(|| {
                if manager == "yay" || manager == "paru" {
                    Some("aur".into())
                } else {
                    None
                }
            })
            .unwrap_or_default(),
        architecture: field_value(&block, "Architecture").unwrap_or_default(),
        url: f_url
            .or_else(|| r.map(|r| r.url.clone()))
            .unwrap_or_default(),
        licenses: if f_lic.is_some() {
            list(f_lic)
        } else {
            r.map(|r| r.licenses.clone()).unwrap_or_default()
        },
        groups: list(field_value(&block, "Groups")),
        provides: if f_prov.is_some() {
            list(f_prov)
        } else {
            r.map(|r| r.provides.clone()).unwrap_or_default()
        },
        depends: if f_dep.is_some() {
            list(f_dep)
        } else {
            r.map(|r| r.depends.clone()).unwrap_or_default()
        },
        optional_deps: if f_opt.is_some() {
            list(f_opt)
        } else {
            r.map(|r| r.opt_depends.clone()).unwrap_or_default()
        },
        required_by: if installed {
            list(field_value(&block, "Required By"))
        } else {
            Vec::new()
        },
        conflicts_with: if f_conf.is_some() {
            list(f_conf)
        } else {
            r.map(|r| r.conflicts.clone()).unwrap_or_default()
        },
        replaces: list(field_value(&block, "Replaces")),
        download_size: if is_remote {
            field_value(&block, "Download Size")
                .map(|s| parse_installed_size(&s))
                .unwrap_or(0)
        } else {
            0
        },
        installed_size: field_value(&block, "Installed Size")
            .map(|s| parse_installed_size(&s))
            .unwrap_or(0),
        packager: field_value(&block, "Packager").unwrap_or_default(),
        build_date: field_value(&block, "Build Date").unwrap_or_default(),
        install_date: if installed {
            field_value(&block, "Install Date").unwrap_or_default()
        } else {
            String::new()
        },
        install_reason: if installed {
            field_value(&block, "Install Reason").unwrap_or_default()
        } else {
            String::new()
        },
        maintainer: r
            .map(|r| r.maintainer.clone())
            .or_else(|| field_value(&block, "Maintainer"))
            .unwrap_or_default(),
        submitted: r.map(|r| ts_to_date(r.first_submitted)).unwrap_or_default(),
        modified: r.map(|r| ts_to_date(r.last_modified)).unwrap_or_default(),
        votes: f_votes.or_else(|| r.map(|r| r.num_votes)).unwrap_or(0),
        popularity: f_pop.or_else(|| r.map(|r| r.popularity)).unwrap_or(0.0),
        out_of_date: ood || r.map(|r| r.out_of_date.is_some()).unwrap_or(false),
        installed,
        explicit: false,
        category: String::new(),
        desktop_files: vec![],
        update: None,

        origin: String::new(),
    };
    if installed {
        let explicit: HashSet<String> = run_capture("pacman", &["-Qe", "-q"])
            .stdout
            .lines()
            .map(str::to_string)
            .collect();
        d.explicit = explicit.contains(&d.name) || is_foreign;
        let gui = desktop_owners_arch();
        d.desktop_files = gui.get(&d.name).cloned().unwrap_or_default();
        let sys = system_closure(&arch_info_map());
        d.origin = arch_origin(is_foreign, explicit.contains(&d.name), &d.groups, sys.contains(&d.name)).into();
        d.category = if is_foreign {
            "aur".into()
        } else if !d.desktop_files.is_empty() {
            "gui".into()
        } else {
            "terminal".into()
        };
    } else {
        d.category = if d.repo.eq_ignore_ascii_case("aur") {
            "aur".into()
        } else {
            "terminal".into()
        };
    }
    Ok(d)
}

/// Consulta la API pública de AUR (RPC v5) con límite de tiempo; nunca debe colgar.
fn aur_rpc(name: &str) -> Option<AurResult> {
    if !command_exists("curl") {
        return None;
    }
    let url = format!("https://aur.archlinux.org/rpc/v5/info?arg[]={name}");
    let out = run_capture_timeout(
        "curl",
        &["-s", "--connect-timeout", "4", "--max-time", "8", &url],
        12,
    );
    if out.stdout.trim().is_empty() {
        return None;
    }
    serde_json::from_str::<AurRpcResp>(&out.stdout)
        .ok()
        .and_then(|resp| resp.results.into_iter().next())
}

#[derive(Debug, Deserialize)]
struct AurRpcResp {
    #[serde(default)]
    results: Vec<AurResult>,
}

#[derive(Debug, Deserialize)]
struct AurResult {
    #[serde(rename = "Name", default)]
    name: String,
    #[serde(rename = "Version", default)]
    version: String,
    #[serde(rename = "Description", default)]
    description: String,
    #[serde(rename = "URL", default)]
    url: String,
    #[serde(rename = "NumVotes", default)]
    num_votes: i64,
    #[serde(rename = "Popularity", default)]
    popularity: f64,
    #[serde(rename = "OutOfDate", default)]
    out_of_date: Option<i64>,
    #[serde(rename = "Maintainer", default)]
    maintainer: String,
    #[serde(rename = "FirstSubmitted", default)]
    first_submitted: i64,
    #[serde(rename = "LastModified", default)]
    last_modified: i64,
    #[serde(rename = "License", default)]
    licenses: Vec<String>,
    #[serde(rename = "Depends", default)]
    depends: Vec<String>,
    #[serde(rename = "OptDepends", default)]
    opt_depends: Vec<String>,
    #[serde(rename = "Provides", default)]
    provides: Vec<String>,
    #[serde(rename = "Conflicts", default)]
    conflicts: Vec<String>,
}

/// Convierte un timestamp Unix (segundos) a fecha ISO "YYYY-MM-DD" (UTC).
fn ts_to_date(ts: i64) -> String {
    if ts <= 0 {
        return String::new();
    }
    let z = ts.div_euclid(86400) + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

fn deb_details(name: &str) -> Result<PkgDetails, String> {
    let o = run_capture("apt", &["show", name]);
    let block = o.stdout;
    if block.trim().is_empty() {
        return Err(format!("No se encontró información de '{name}'"));
    }
    let long_block = run_capture("apt-cache", &["show", name]).stdout;
    let description = field_block(&long_block, "Description-en")
        .or_else(|| field_value(&long_block, "Description"))
        .or_else(|| field_value(&block, "Description"))
        .unwrap_or_default();
    let q = run_capture("dpkg-query", &["-W", name]);
    let installed = q.code == Some(0);
    let mut optional = list(field_value(&block, "Recommends"));
    optional.append(&mut list(field_value(&block, "Suggests")));
    Ok(PkgDetails {
        name: field_value(&block, "Package").unwrap_or_else(|| name.to_string()),
        version: field_value(&block, "Version").unwrap_or_default(),
        description,
        manager: "apt".into(),
        repo: field_value(&block, "Origin").unwrap_or_default(),
        architecture: field_value(&block, "Architecture").unwrap_or_default(),
        url: field_value(&block, "Homepage").unwrap_or_default(),
        licenses: list(field_value(&block, "License")),
        groups: vec![],
        provides: list(field_value(&block, "Provides")),
        depends: list(field_value(&block, "Depends")),
        optional_deps: optional,
        required_by: vec![],
        conflicts_with: list(field_value(&block, "Conflicts")),
        replaces: list(field_value(&block, "Replaces")),
        download_size: field_value(&block, "Size")
            .and_then(|s| s.parse::<f64>().ok().map(|b| b as i64))
            .unwrap_or(0),
        installed_size: field_value(&block, "Installed-Size")
            .and_then(|s| s.parse::<f64>().ok().map(|kb| (kb * 1024.0) as i64))
            .unwrap_or(0),
        packager: field_value(&block, "Maintainer").unwrap_or_default(),
        build_date: String::new(),
        install_date: String::new(),
        install_reason: String::new(),
        maintainer: String::new(),
        submitted: String::new(),
        modified: String::new(),
        votes: 0,
        popularity: 0.0,
        out_of_date: false,
        installed,
        explicit: installed,
        category: "terminal".into(),
        desktop_files: vec![],
        update: None,

        origin: String::new(),
    })
}

fn rpm_details(manager: &str, name: &str) -> Result<PkgDetails, String> {
    let q = run_capture("rpm", &["-q", name]);
    let installed = q.code == Some(0);
    if installed {
        let info = run_capture("rpm", &["-qi", name]).stdout;
        let full = run_capture("rpm", &["-q", "--qf", "%{DESCRIPTION}", name])
            .stdout
            .trim()
            .to_string();
        let description = if !full.is_empty() {
            full
        } else {
            field_value(&info, "Summary").unwrap_or_default()
        };
        let version = format!(
            "{}-{}",
            field_value(&info, "Version").unwrap_or_default(),
            field_value(&info, "Release").unwrap_or_default()
        );
        return Ok(PkgDetails {
            name: field_value(&info, "Name").unwrap_or_else(|| name.to_string()),
            version,
            description,
            manager: manager.into(),
            repo: String::new(),
            architecture: field_value(&info, "Architecture").unwrap_or_default(),
            url: field_value(&info, "URL").unwrap_or_default(),
            licenses: list(field_value(&info, "License")),
            groups: list(field_value(&info, "Group"))
                .into_iter()
                .filter(|g| !g.eq_ignore_ascii_case("Unspecified"))
                .collect(),
            provides: vec![],
            depends: vec![],
            optional_deps: vec![],
            required_by: vec![],
            conflicts_with: vec![],
            replaces: vec![],
            download_size: 0,
            installed_size: field_value(&info, "Size")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
            packager: field_value(&info, "Packager").unwrap_or_default(),
            build_date: field_value(&info, "Build Time").unwrap_or_default(),
            install_date: field_value(&info, "Install Time").unwrap_or_default(),
            install_reason: String::new(),
            maintainer: String::new(),
            submitted: String::new(),
            modified: String::new(),
            votes: 0,
            popularity: 0.0,
            out_of_date: false,
            installed: true,
            explicit: true,
            category: "terminal".into(),
            desktop_files: vec![],
            update: None,

            origin: String::new(),
        });
    }
    let block = if manager == "zypper" {
        run_capture("zypper", &["info", name]).stdout
    } else {
        run_capture("dnf", &["info", name]).stdout
    };
    if block.trim().is_empty() {
        return Err(format!("No se encontró información de '{name}'"));
    }
    let version = format!(
        "{}-{}",
        field_value(&block, "Version").unwrap_or_default(),
        field_value(&block, "Release").unwrap_or_default()
    );
    let description = field_block(&block, "Description")
        .or_else(|| field_value(&block, "Summary"))
        .unwrap_or_default();
    let dl = if manager == "zypper" {
        field_value(&block, "Download Size")
            .map(|s| parse_installed_size(&s))
            .unwrap_or(0)
    } else {
        field_value(&block, "Size")
            .map(|s| parse_installed_size(&s))
            .unwrap_or(0)
    };
    Ok(PkgDetails {
        name: field_value(&block, "Name").unwrap_or_else(|| name.to_string()),
        version,
        description,
        manager: manager.into(),
        repo: field_value(&block, "Repository").unwrap_or_default(),
        architecture: field_value(&block, "Architecture").unwrap_or_default(),
        url: field_value(&block, "URL").unwrap_or_default(),
        licenses: list(field_value(&block, "License")),
        groups: vec![],
        provides: vec![],
        depends: vec![],
        optional_deps: vec![],
        required_by: vec![],
        conflicts_with: vec![],
        replaces: vec![],
        download_size: dl,
        installed_size: 0,
        packager: String::new(),
        build_date: String::new(),
        install_date: String::new(),
        install_reason: String::new(),
        maintainer: String::new(),
        submitted: String::new(),
        modified: String::new(),
        votes: 0,
        popularity: 0.0,
        out_of_date: false,
        installed: false,
        explicit: false,
        category: "terminal".into(),
        desktop_files: vec![],
        update: None,

        origin: String::new(),
    })
}

fn flatpak_details(name: &str) -> Result<PkgDetails, String> {
    let o = run_capture(
        "flatpak",
        &["list", "--app", "--columns=application,name,version"],
    )
    .stdout;
    let installed = o.lines().any(|l| l.split('\t').next() == Some(name));
    let block = if installed {
        run_capture("flatpak", &["info", name]).stdout
    } else {
        String::new()
    };
    Ok(PkgDetails {
        name: name.to_string(),
        version: if installed {
            o.lines()
                .find(|l| l.split('\t').next() == Some(name))
                .and_then(|l| l.split('\t').nth(2).map(|s| s.trim().to_string()))
                .unwrap_or_default()
        } else {
            String::new()
        },
        description: field_value(&block, "Summary").unwrap_or_default(),
        manager: "flatpak".into(),
        repo: field_value(&block, "Origin").unwrap_or_default(),
        architecture: field_value(&block, "Architecture").unwrap_or_default(),
        url: field_value(&block, "Url").unwrap_or_default(),
        licenses: vec![],
        groups: vec![],
        provides: vec![],
        depends: vec![],
        optional_deps: vec![],
        required_by: vec![],
        conflicts_with: vec![],
        replaces: vec![],
        download_size: 0,
        installed_size: field_value(&block, "Installed size")
            .map(|s| parse_installed_size(&s))
            .unwrap_or(0),
        packager: String::new(),
        build_date: String::new(),
        install_date: String::new(),
        install_reason: String::new(),
        maintainer: String::new(),
        submitted: String::new(),
        modified: String::new(),
        votes: 0,
        popularity: 0.0,
        out_of_date: false,
        installed,
        explicit: installed,
        category: if installed {
            "flatpak".into()
        } else {
            "terminal".into()
        },
        desktop_files: vec![],
        update: None,

        origin: String::new(),
    })
}

fn snap_details(name: &str) -> Result<PkgDetails, String> {
    let o = run_capture("snap", &["info", name]);
    let block = o.stdout;
    if block.trim().is_empty() {
        return Err(format!("No se encontró información de '{name}'"));
    }
    let installed = block.lines().any(|l| l.starts_with("tracking:"));
    let description = field_block(&block, "description")
        .or_else(|| field_value(&block, "summary"))
        .unwrap_or_default();
    Ok(PkgDetails {
        name: field_value(&block, "name").unwrap_or_else(|| name.to_string()),
        version: block
            .lines()
            .find(|l| l.trim_start().starts_with("installed:"))
            .and_then(|l| {
                l.split(':')
                    .nth(1)
                    .map(|s| s.trim().split_whitespace().next().unwrap_or("").to_string())
            })
            .unwrap_or_else(|| {
                block
                    .lines()
                    .find(|l| l.trim_start().starts_with("latest:"))
                    .and_then(|l| l.split(':').nth(1).map(|s| s.trim().to_string()))
                    .unwrap_or_default()
            }),
        description,
        manager: "snap".into(),
        repo: block
            .lines()
            .find(|l| l.trim_start().starts_with("tracking:"))
            .and_then(|l| l.split(':').nth(1).map(|s| s.trim().to_string()))
            .unwrap_or_default(),
        architecture: String::new(),
        url: field_value(&block, "contact").unwrap_or_default(),
        licenses: vec![],
        groups: vec![],
        provides: vec![],
        depends: vec![],
        optional_deps: vec![],
        required_by: vec![],
        conflicts_with: vec![],
        replaces: vec![],
        download_size: 0,
        installed_size: 0,
        packager: field_value(&block, "developer").unwrap_or_default(),
        build_date: String::new(),
        install_date: String::new(),
        install_reason: String::new(),
        maintainer: String::new(),
        submitted: String::new(),
        modified: String::new(),
        votes: 0,
        popularity: 0.0,
        out_of_date: false,
        installed,
        explicit: installed,
        category: if installed {
            "snap".into()
        } else {
            "terminal".into()
        },
        desktop_files: vec![],
        update: None,

        origin: String::new(),
    })
}

// ---------------- Maintenance ----------------

pub fn get_cache_info(app: &tauri::AppHandle) -> Vec<crate::model::CacheInfo> {
    use crate::model::CacheInfo;
    let mut v: Vec<CacheInfo> = Vec::new();
    let fam = settings::load(app).family;

    if fam == "arch" {
        let r = dir_size("/var/cache/pacman/pkg");
        v.push(CacheInfo {
            label: "Caché de pacman".into(),
            path: "/var/cache/pacman/pkg".into(),
            size_bytes: r,
        });
        if let Ok(home) = std::env::var("HOME") {
            let p = format!("{home}/.cache/yay");
            if Path::new(&p).exists() {
                v.push(CacheInfo {
                    label: "Caché de compilación yay".into(),
                    path: p.clone(),
                    size_bytes: dir_size(&p),
                });
            }
        }
    }
    if enabled(app, "apt") {
        let r = dir_size("/var/cache/apt");
        v.push(CacheInfo {
            label: "Caché de apt".into(),
            path: "/var/cache/apt".into(),
            size_bytes: r,
        });
    }
    if enabled(app, "dnf") {
        let r = dir_size("/var/cache/dnf");
        v.push(CacheInfo {
            label: "Caché de dnf".into(),
            path: "/var/cache/dnf".into(),
            size_bytes: r,
        });
    }
    v
}

pub fn get_orphans(app: &tauri::AppHandle) -> Vec<Pkg> {
    let fam = settings::load(app).family;
    if fam != "arch" || !command_exists("pacman") {
        return Vec::new();
    }
    let o = run_capture("pacman", &["-Qdtq"]);
    o.stdout
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|n| Pkg {
            name: n.trim().into(),
            version: String::new(),
            description: "Paquete huérfano (ya no es dependencia de nada)".into(),
            manager: "pacman".into(),
            category: "terminal".into(),
            size: 0,
            explicit: false,
            origin: "dependencia".into(),
            desktop_files: vec![],
            update: None,
        })
        .collect()
}

pub fn dir_size(path: &str) -> Option<i64> {
    fn walk(p: &std::path::Path, total: &mut i64) -> std::io::Result<()> {
        for e in std::fs::read_dir(p)? {
            let e = e?;
            let meta = e.metadata()?;
            if meta.is_dir() {
                walk(&e.path(), total)?;
            } else {
                *total += meta.len() as i64;
            }
        }
        Ok(())
    }
    let mut total = 0i64;
    if walk(Path::new(path), &mut total).is_err() {
        return None;
    }
    Some(total)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::SearchResult;

    fn sr(name: &str, installed: bool, source: &str) -> SearchResult {
        SearchResult {
            manager: "yay".into(),
            name: name.into(),
            version: "1".into(),
            description: String::new(),
            repo: "aur".into(),
            installed,
            votes: 0,
            popularity: 0.0,
            source: source.into(),
            origin: String::new(),
        }
    }

    #[test]
    fn arch_info_tiene_descripcion_y_tamano() {
        let info = arch_info_map();
        let ai = info.get("bash").cloned().unwrap_or_default();
        assert!(
            !ai.desc.is_empty(),
            "descripción vacía para bash (bug de espaciado)"
        );
        assert!(ai.size > 0, "tamaño 0 para bash");
    }

    #[test]
    fn field_value_ignora_espaciado_variable() {
        let block = run_capture("pacman", &["-Qi", "bash"]).stdout;
        let name = field_value(&block, "Name").unwrap_or_default();
        let desc = field_value(&block, "Description").unwrap_or_default();
        let size = field_value(&block, "Installed Size").unwrap_or_default();
        assert_eq!(name, "bash");
        assert!(!desc.is_empty());
        assert!(size.contains("MiB"));
    }

    #[test]
    fn search_repos_parsea_votos_y_desactualizado() {
        let mut out = Vec::new();
        let installed = HashSet::new();
        search_repos_arch("yay", "gitkraken", &installed, &mut out);
        assert!(!out.is_empty(), "sin resultados");
        let outdated = out.iter().find(|s| s.name == "gitkraken-cli");
        assert!(
            outdated.is_some(),
            "no se parseó la línea con (Out-of-date:)"
        );
        let s = outdated.unwrap();
        assert_eq!(s.repo, "aur");
        assert!(s.votes > 0, "votos no parseados");
        assert_eq!(s.source, "aur");
    }

    #[test]
    fn arch_origin_clasifica_sistema_extra_y_dependencia() {
        let base = vec!["base".to_string()];
        let dev = vec!["base-devel".to_string(), "extra".to_string()];
        assert_eq!(arch_origin(false, true, &base, false), "sistema");
        assert_eq!(arch_origin(false, false, &dev, false), "sistema");
        assert_eq!(arch_origin(false, false, &[], true), "sistema");
        assert_eq!(arch_origin(true, true, &[], true), "extra");
        assert_eq!(arch_origin(true, false, &[], false), "extra");
        assert_eq!(arch_origin(false, true, &[], false), "extra");
        assert_eq!(arch_origin(false, false, &[], false), "dependencia");
    }

    #[test]
    fn system_closure_incluye_dependencias_de_base() {
        let mut info = HashMap::new();
        info.insert(
            "base".to_string(),
            ArchInfo { desc: String::new(), size: 0, groups: vec![], depends: vec!["bash".to_string(), "glibc".to_string()] },
        );
        info.insert(
            "bash".to_string(),
            ArchInfo { desc: String::new(), size: 0, groups: vec![], depends: vec!["glibc".to_string(), "readline".to_string()] },
        );
        info.insert("glibc".to_string(), ArchInfo::default());
        info.insert("readline".to_string(), ArchInfo::default());
        info.insert("firefox".to_string(), ArchInfo::default());
        let sys = system_closure(&info);
        assert!(sys.contains("base"));
        assert!(sys.contains("bash"));
        assert!(sys.contains("glibc"));
        assert!(sys.contains("readline"));
        assert!(!sys.contains("firefox"));
    }

    #[test]
    fn dep_name_quita_restricciones_de_version() {
        assert_eq!(dep_name("glibc>=2.33").as_deref(), Some("glibc"));
        assert_eq!(dep_name("bash").as_deref(), Some("bash"));
        assert_eq!(dep_name("None"), None);
        assert_eq!(dep_name(""), None);
    }

    #[test]
    fn relevancia_prioriza_nombre_exacto() {
        let mut v = vec![sr("myapp-old", true, "aur"), sr("myapp", false, "aur")];
        let out = finalize_results(std::mem::take(&mut v), "myapp");
        assert_eq!(out[0].name, "myapp");
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn dedupe_prefiere_instalado() {
        let mut v = vec![sr("foo", false, "aur"), sr("foo", true, "instalado")];
        let out = finalize_results(std::mem::take(&mut v), "foo");
        assert_eq!(out.len(), 1);
        assert!(out[0].installed);
    }

    #[test]
    fn ts_to_date_formatea_timestamps() {
        assert_eq!(ts_to_date(0), "");
        assert_eq!(ts_to_date(-5), "");
        assert_eq!(ts_to_date(1_459_948_564), "2016-04-06");
        assert_eq!(ts_to_date(0), "");
    }

    #[test]
    fn aur_result_parsea_respuesta_rpc() {
        let json = r#"{
            "version": 5,
            "resultcount": 1,
            "results": [{
                "Name": "brave-bin",
                "Version": "1.53.114-1",
                "Description": "Web browser that blocks ads and trackers by default (binary release)",
                "URL": "https://brave.com",
                "NumVotes": 1033,
                "Popularity": 2.5,
                "OutOfDate": null,
                "Maintainer": "brave",
                "FirstSubmitted": 1459948564,
                "LastModified": 1789139934,
                "License": ["BSD", "MPL2"],
                "Depends": ["gtk3", "nss"],
                "Conflicts": ["brave"]
            }]
        }"#;
        let resp: AurRpcResp = serde_json::from_str(json).expect("JSON de AUR RPC inválido");
        assert_eq!(resp.results.len(), 1);
        let r = &resp.results[0];
        assert_eq!(r.name, "brave-bin");
        assert_eq!(r.maintainer, "brave");
        assert_eq!(r.num_votes, 1033);
        assert_eq!(r.licenses, vec!["BSD".to_string(), "MPL2".to_string()]);
        assert_eq!(ts_to_date(r.first_submitted), "2016-04-06");
        assert!(!ts_to_date(r.last_modified).is_empty());
    }
}
