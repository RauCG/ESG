use crate::detect;
use crate::model::{ManagerInfo, Settings};
use crate::util::command_exists;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

pub fn path(app: &tauri::AppHandle) -> PathBuf {
    let mut dir = app.path().app_config_dir().unwrap_or_default();
    dir.push("settings.json");
    dir
}

pub fn load(app: &tauri::AppHandle) -> Settings {
    let p = path(app);
    if let Ok(text) = fs::read_to_string(&p) {
        if let Ok(s) = serde_json::from_str::<Settings>(&text) {
            return s;
        }
    }
    detect_defaults()
}

pub fn save(app: &tauri::AppHandle, settings: &Settings) -> Result<(), String> {
    let p = path(app);
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&p, text).map_err(|e| e.to_string())
}

pub fn detect_defaults() -> Settings {
    let family = detect::guess_family();
    let mut managers: Vec<ManagerInfo> = crate::model::all_managers();
    for m in managers.iter_mut() {
        m.detected = command_exists(&m.id);
    }
    apply_family_defaults(&family, &mut managers);
    Settings {
        family,
        managers,
        show_dependencies: false,
    }
}

pub fn apply_family_defaults(family: &str, managers: &mut [ManagerInfo]) {
    for m in managers.iter_mut() {
        m.enabled = false;
    }
    let wanted: &[&str] = match family {
        "arch" => &["pacman", "yay", "paru", "flatpak", "snap"],
        "debian" => &["apt", "flatpak", "snap"],
        "fedora" | "rhel" => &["dnf", "flatpak", "snap"],
        "suse" => &["zypper", "flatpak", "snap"],
        _ => &[],
    };
    for m in managers.iter_mut() {
        if m.id == "pacman" && !command_exists("pacman") {
            m.enabled = false;
            continue;
        }
        if wanted.contains(&m.id.as_str()) {
            if m.id == "apt" && !command_exists("apt") {
                m.enabled = false;
                continue;
            }
            // AUR helpers: enable the first detected one
            if m.id == "yay" || m.id == "paru" {
                let other = if m.id == "yay" { "paru" } else { "yay" };
                if command_exists(&other) && command_exists(&m.id) {
                    // prefer paru if both
                    if m.id == "yay" {
                        m.enabled = false;
                        continue;
                    }
                }
                m.enabled = command_exists(&m.id);
                if !m.enabled {
                    m.note = Some("No instalado en PATH".into());
                }
                continue;
            }
            m.enabled = m.detected || m.id == "pacman";
        }
    }
}
