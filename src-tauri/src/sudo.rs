use std::io::Write;
use std::process::{Command, Stdio};

pub fn user() -> String {
    std::env::var("USER").unwrap_or_else(|_| std::env::var("LOGNAME").unwrap_or_else(|_| "".into()))
}

pub fn sudo_available() -> bool {
    crate::util::command_exists("sudo")
}

/// Comprueba si el timestamp de sudo sigue válido usando `sudo -n true`.
pub fn ok_now() -> bool {
    if !sudo_available() {
        return false;
    }
    let o = Command::new("sudo")
        .arg("-n")
        .arg("true")
        .env("LC_ALL", "C")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    matches!(o, Ok(s) if s.success())
}

/// Valida la contraseña con `sudo -S -v` (solo valida y cachea el timestamp).
/// La contraseña se escribe por stdin y se descarta inmediatamente.
pub fn verify_password(password: &str) -> Result<(), String> {
    if !sudo_available() {
        return Err("sudo no está instalado en el sistema".into());
    }
    let mut child = Command::new("sudo")
        .arg("-S")
        .arg("-v")
        .env("LC_ALL", "C")
        .env("HOME", std::env::var("HOME").unwrap_or_default())
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No se pudo lanzar sudo: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        let _ = writeln!(stdin, "{}", password);
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(
            if stderr.contains("incorrect password")
                || stderr.contains("Try again")
                || stderr.contains("contraseña incorrecta")
            {
                "Contraseña incorrecta".into()
            } else {
                format!("sudo rechazó la contraseña: {}", stderr.trim())
            },
        )
    }
}
