use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub os: String,
    pub distro: String,
    pub distro_like: String,
    pub version_id: String,
    pub pretty_name: String,
    pub kernel: String,
    pub arch: String,
    pub hostname: String,
    pub desktop: String,
    pub session: String,
    pub default_family: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagerInfo {
    pub id: String,
    pub label: String,
    pub family: String,
    pub detected: bool,
    pub enabled: bool,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub family: String,
    pub managers: Vec<ManagerInfo>,
    pub show_dependencies: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            family: "arch".into(),
            managers: all_managers(),
            show_dependencies: false,
        }
    }
}

pub fn all_managers() -> Vec<ManagerInfo> {
    let ids = [
        ("pacman", "Pacman (nativo)", "arch"),
        ("yay", "Yay (AUR)", "arch"),
        ("paru", "Paru (AUR)", "arch"),
        ("flatpak", "Flatpak", "universal"),
        ("snap", "Snap", "universal"),
        ("apt", "APT (Debian/Ubuntu)", "debian"),
        ("dnf", "DNF (Fedora/RHEL)", "fedora"),
        ("zypper", "Zypper (openSUSE)", "suse"),
    ];
    ids.iter()
        .map(|(id, label, family)| ManagerInfo {
            id: id.to_string(),
            label: label.to_string(),
            family: family.to_string(),
            detected: false,
            enabled: false,
            note: None,
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pkg {
    pub name: String,
    pub version: String,
    pub description: String,
    pub manager: String,
    pub category: String,
    pub size: i64,
    pub explicit: bool,
    /// Origen en Arch: "sistema" (grupo base), "dependencia" o "extra".
    /// Vacío cuando no se conoce (otros gestores).
    pub origin: String,
    /// Fecha de instalación (epoch UTC, 0 si se desconoce). Solo Arch.
    pub install_date: i64,
    pub desktop_files: Vec<String>,
    pub update: Option<UpdateInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub new_version: String,
    pub repo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListResult {
    pub packages: Vec<Pkg>,
    pub errors: Vec<String>,
    pub managers_used: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub manager: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub repo: String,
    pub installed: bool,
    pub votes: i64,
    pub popularity: f64,
    pub source: String,
    /// Igual que en Pkg; vacío para resultados remotos.
    pub origin: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PkgDetails {
    pub name: String,
    pub version: String,
    pub description: String,
    pub manager: String,
    pub repo: String,
    pub architecture: String,
    pub url: String,
    pub licenses: Vec<String>,
    pub groups: Vec<String>,
    pub provides: Vec<String>,
    pub depends: Vec<String>,
    pub optional_deps: Vec<String>,
    pub required_by: Vec<String>,
    pub conflicts_with: Vec<String>,
    pub replaces: Vec<String>,
    pub download_size: i64,
    pub installed_size: i64,
    pub packager: String,
    pub build_date: String,
    pub install_date: String,
    pub install_reason: String,
    pub maintainer: String,
    pub submitted: String,
    pub modified: String,
    pub votes: i64,
    pub popularity: f64,
    pub out_of_date: bool,
    pub installed: bool,
    pub explicit: bool,
    pub category: String,
    /// Igual que en Pkg; vacío cuando no se conoce.
    pub origin: String,
    pub desktop_files: Vec<String>,
    pub update: Option<UpdateInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheInfo {
    pub label: String,
    pub path: String,
    pub size_bytes: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PtsEvent {
    Data {
        id: u32,
        data: Vec<u8>,
    },
    Exit {
        id: u32,
        success: bool,
        code: Option<i32>,
        signal: Option<String>,
    },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpRequest {
    pub kind: String,
    pub manager: String,
    pub packages: Option<Vec<String>>,
}
