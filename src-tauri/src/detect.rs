use crate::model::SystemInfo;
use crate::util::run_capture;

pub fn guess_family_from_ids(id: &str, like: &str) -> String {
    let hay = format!("{id} {like}");
    let hay = hay.to_lowercase();
    if hay.contains("arch") {
        "arch".into()
    } else if hay.contains("debian") || hay.contains("ubuntu") {
        "debian".into()
    } else if hay.contains("fedora") {
        "fedora".into()
    } else if hay.contains("rhel")
        || hay.contains("centos")
        || hay.contains("rocky")
        || hay.contains("almalinux")
    {
        "rhel".into()
    } else if hay.contains("suse") {
        "suse".into()
    } else if hay.contains("nixos") {
        "nix".into()
    } else {
        "other".into()
    }
}

pub fn guess_family() -> String {
    let (id, like) = read_os_release();
    guess_family_from_ids(&id, &like)
}

pub fn read_os_release() -> (String, String) {
    for file in ["/etc/os-release", "/usr/lib/os-release"] {
        if let Ok(text) = std::fs::read_to_string(file) {
            let mut id = String::new();
            let mut like = String::new();
            for line in text.lines() {
                if let Some(v) = line.strip_prefix("ID=") {
                    id = v.trim_matches('"').to_string();
                } else if let Some(v) = line.strip_prefix("ID_LIKE=") {
                    like = v.trim_matches('"').to_string();
                }
            }
            return (id, like);
        }
    }
    (String::new(), String::new())
}

pub fn detect_system() -> SystemInfo {
    let (id, like) = read_os_release();
    let pretty = std::fs::read_to_string("/etc/os-release")
        .ok()
        .and_then(|text| {
            text.lines()
                .find_map(|l| l.strip_prefix("PRETTY_NAME="))
                .map(|v| v.trim_matches('"').to_string())
        })
        .unwrap_or_else(|| "Linux".into());
    let version_id = std::fs::read_to_string("/etc/os-release")
        .ok()
        .and_then(|text| {
            text.lines()
                .find_map(|l| l.strip_prefix("VERSION_ID="))
                .map(|v| v.trim_matches('"').to_string())
        })
        .unwrap_or_default();
    let distro = if pretty.is_empty() {
        id.clone()
    } else {
        pretty.clone()
    };
    let kernel = run_capture("uname", &["-r"]).stdout.trim().to_string();
    let arch = run_capture("uname", &["-m"]).stdout.trim().to_string();
    let hostname = run_capture("hostname", &[]).stdout.trim().to_string();
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
    let session = std::env::var("XDG_SESSION_TYPE")
        .unwrap_or_else(|_| std::env::var("DESKTOP_SESSION").unwrap_or_default());
    let default_family = guess_family_from_ids(&id, &like);
    SystemInfo {
        os: "linux".into(),
        distro,
        distro_like: like,
        version_id,
        pretty_name: pretty,
        kernel,
        arch,
        hostname,
        desktop,
        session,
        default_family,
    }
}
