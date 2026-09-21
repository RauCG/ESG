use crate::model::OpRequest;
use crate::pty::{spawn_shell, SpawnSpec, PtsState};
use crate::util::command_exists;

pub fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

pub fn quote_all(names: &[String]) -> String {
    names.iter().map(|n| shell_quote(n)).collect::<Vec<_>>().join(" ")
}

pub fn script_for(req: &OpRequest) -> Result<String, String> {
    let kind = req.kind.as_str();
    let man = req.manager.as_str();
    let pkgs: &[String] = req.packages.as_deref().unwrap_or(&[]);
    let quoted = quote_all(pkgs);

    let s = match (kind, man) {
        ("update", "pacman") => "sudo pacman -Syu --noconfirm".to_string(),
        ("update", "yay") | ("update", "paru") => format!("{} -Syu --noconfirm --cleanafter", man),
        ("update", "apt") => "sudo apt-get update && sudo apt-get upgrade -y && sudo apt-get autoremove -y".to_string(),
        ("update", "dnf") => "sudo dnf upgrade -y".to_string(),
        ("update", "zypper") => "sudo zypper -n dup".to_string(),
        ("update", "flatpak") => "flatpak update -y".to_string(),
        ("update", "snap") => "sudo snap refresh".to_string(),

        ("upgrade", "pacman") => "sudo pacman -Syu --noconfirm".to_string(),
        ("upgrade", "yay") | ("upgrade", "paru") => format!("{} -S --noconfirm --needed", man),
        ("upgrade", "apt") => format!("sudo apt-get install -y --only-upgrade {quoted}"),
        ("upgrade", "dnf") => "sudo dnf upgrade -y".to_string(),
        ("upgrade", "zypper") => "sudo zypper -n up".to_string(),
        ("upgrade", "flatpak") => "flatpak update -y".to_string(),
        ("upgrade", "snap") => "sudo snap refresh".to_string(),

        ("install", "pacman") => format!("sudo pacman -S --noconfirm --needed {quoted}"),
        ("install", "yay") | ("install", "paru") => format!("{man} -S --noconfirm --needed {quoted}"),
        ("install", "apt") => format!("sudo apt-get install -y {quoted} && sudo apt-get autoremove -y"),
        ("install", "dnf") => format!("sudo dnf install -y {quoted}"),
        ("install", "zypper") => format!("sudo zypper -n install -y {quoted}"),
        ("install", "flatpak") => format!("flatpak install -y --noninteractive {quoted}"),
        ("install", "snap") => format!("sudo snap install {quoted}"),

        ("uninstall", "pacman") => format!("sudo pacman -Rns --noconfirm {quoted}"),
        ("uninstall", "yay") | ("uninstall", "paru") => format!("sudo pacman -Rns --noconfirm {quoted}"),
        ("uninstall", "apt") => format!("sudo apt-get autoremove -y --purge {quoted} && sudo apt-get autoremove -y"),
        ("uninstall", "dnf") => format!("sudo dnf remove -y {quoted}"),
        ("uninstall", "zypper") => format!("sudo zypper -n rm {quoted}"),
        ("uninstall", "flatpak") => format!("flatpak uninstall -y {quoted}"),
        ("uninstall", "snap") => format!("sudo snap remove {quoted}"),

        ("orphans", "pacman") => {
            "pkgs=$(pacman -Qtdq); if [ -n \"$pkgs\" ]; then echo \"Eliminando huérfanos:\"; echo \"$pkgs\"; sudo pacman -Rns --noconfirm $pkgs; else echo 'No hay paquetes huérfanos.'; fi".to_string()
        }
        ("orphans", "apt") => "sudo apt-get autoremove -y".to_string(),
        ("orphans", "dnf") => "sudo dnf autoremove -y".to_string(),

        ("cache", "pacman") => "sudo paccache -rk1 && sudo paccache -ruk0 && echo 'Caché de pacman limpiada.'".to_string(),
        ("cache", "yay") | ("cache", "paru") => format!("{man} -Sc --noconfirm"),
        ("cache", "apt") => "sudo apt-get clean && echo 'Caché de apt limpiada.'".to_string(),
        ("cache", "dnf") => "sudo dnf clean all && echo 'Caché de dnf limpiada.'".to_string(),

        _ => return Err(format!("Operación '{kind}' no soportada para '{man}'")),
    };
    Ok(s)
}

pub fn label_for(req: &OpRequest) -> String {
    match (req.kind.as_str(), req.manager.as_str()) {
        ("update", m) => format!("Actualizar ({m})"),
        ("upgrade", _) => format!("Actualizar {}", req.packages.as_deref().unwrap_or(&[]).join(", ")),
        ("install", _) => format!("Instalar {}", req.packages.as_deref().unwrap_or(&[]).join(", ")),
        ("uninstall", _) => format!("Desinstalar {}", req.packages.as_deref().unwrap_or(&[]).join(", ")),
        ("orphans", _) => "Limpiar paquetes huérfanos".into(),
        ("cache", m) => format!("Limpiar caché ({m})"),
        _ => "Operación".into(),
    }
}

pub fn start_op(_app: &tauri::AppHandle, state: &PtsState, req: OpRequest) -> Result<u32, String> {
    let script = script_for(&req)?;
    let label = label_for(&req);
    // Capturar el código real de la operación: `echo` pisa `$?`, así que se
    // guarda en `code` antes y se sale con ese código para que el evento
    // `exit` del PTY refleje el resultado verdadero (antes siempre era 0).
    let script = format!("echo '» {}'; {}\ncode=$?; echo;\necho \"Proceso finalizado (código $code).\"; exit $code", label, script);
    spawn_shell(state, SpawnSpec {
        label,
        kind: "op".into(),
        cwd: None,
        exec: Some(script),
        interactive: false,
    })
}

pub fn launch_desktop(name: &str) -> Result<(), String> {
    let base = name.trim_end_matches(".desktop");
    if base.is_empty() {
        return Err("Nombre de aplicación vacío".into());
    }
    // Buscar el fichero .desktop
    let mut path = None;
    for dir in crate::util::desktop_dirs() {
        let p = dir.join(format!("{base}.desktop"));
        if p.is_file() {
            path = Some(p);
            break;
        }
    }
    let launch = if command_exists("gtk-launch") {
        std::process::Command::new("gtk-launch").arg(base).spawn().is_ok()
    } else {
        false
    };
    if !launch {
        if let Some(p) = path {
            std::process::Command::new("gio").args(["launch", p.to_str().unwrap_or("")]).spawn()
                .map_err(|e| format!("No se pudo lanzar la app: {e}"))?;
        } else if command_exists("xdg-open") {
            std::process::Command::new("xdg-open").arg(base).spawn()
                .map_err(|e| format!("No se pudo lanzar la app: {e}"))?;
        } else {
            return Err("No se encontraron herramientas para lanzar la aplicación".into());
        }
    }
    Ok(())
}