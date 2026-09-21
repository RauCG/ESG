use regex::Regex;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub struct CapturedOutput {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

pub fn run_capture(prog: &str, args: &[&str]) -> CapturedOutput {
    run_capture_env(prog, args, &[])
}

/// Variante con límite de tiempo: ejecuta `timeout <secs> <prog> args...`.
/// Si `timeout` no está disponible (coreutils), caen al comportamiento normal.
pub fn run_capture_timeout(prog: &str, args: &[&str], secs: u64) -> CapturedOutput {
    if command_exists("timeout") {
        let mut full: Vec<String> = vec![secs.to_string(), prog.to_string()];
        full.extend(args.iter().map(|s| s.to_string()));
        run_capture_list("timeout", full)
    } else {
        run_capture(prog, args)
    }
}

pub fn run_capture_list(prog: &str, args: Vec<String>) -> CapturedOutput {
    let mut cmd = Command::new(prog);
    cmd.args(&args);
    capture(&mut cmd)
}

pub fn run_capture_env(prog: &str, args: &[&str], extra_env: &[(&str, &str)]) -> CapturedOutput {
    let mut cmd = Command::new(prog);
    cmd.args(args);
    for (k, v) in extra_env {
        cmd.env(k, v);
    }
    capture(&mut cmd)
}

fn capture(cmd: &mut Command) -> CapturedOutput {
    if let Ok(mut child) = cmd
        .env("LC_ALL", "C")
        .env("LANG", "C")
        .env("LANGUAGE", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        let mut out = String::new();
        let mut err = String::new();
        if let Some(mut so) = child.stdout.take() {
            let _ = so.read_to_string(&mut out);
        }
        if let Some(mut se) = child.stderr.take() {
            let _ = se.read_to_string(&mut err);
        }
        let code = child.wait().ok().map(|s| s.code()).flatten();
        CapturedOutput {
            code,
            stdout: out,
            stderr: err,
        }
    } else {
        CapturedOutput {
            code: None,
            stdout: String::new(),
            stderr: "No se pudo ejecutar el comando".into(),
        }
    }
}

pub fn command_exists(bin: &str) -> bool {
    let path = std::env::var("PATH").unwrap_or_default();
    for dir in path.split(':') {
        let p = Path::new(dir).join(bin);
        if p.is_file() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(md) = std::fs::metadata(&p) {
                    if md.permissions().mode() & 0o111 != 0 {
                        return true;
                    }
                }
            }
            #[cfg(not(unix))]
            return true;
        }
    }
    false
}

pub fn shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into())
}

pub fn field_value(block: &str, field: &str) -> Option<String> {
    let re = Regex::new(&format!(r"(?m)^{}\s*:\s*(.*)$", regex::escape(field))).ok()?;
    let mut res: Option<String> = None;
    for caps in re.captures_iter(block) {
        let v = caps[1].trim().to_string();
        if !v.is_empty() {
            res = Some(v);
        }
    }
    res
}

pub fn field_block(block: &str, field: &str) -> Option<String> {
    let start = Regex::new(&format!(r"(?m)^{}\s*:\s*(.*)$", regex::escape(field))).ok()?;
    let next = Regex::new(r"^[A-Za-z][A-Za-z -]+\s*:.+").ok()?;
    let cap = start.captures(block)?;
    let start_idx = cap.get(0).map(|m| m.start()).unwrap_or(0);
    let first = cap.get(1).map(|m| m.as_str().trim()).unwrap_or("");
    let mut body = first.to_string();
    if body == "|" || body == "|-" {
        body.clear();
    }
    let mut started = !body.is_empty();
    for line in block[start_idx..].lines().skip(1) {
        if line.trim().is_empty() {
            break;
        }
        let trimmed = line.trim_start();
        let indent = line.len() != trimmed.len();
        if next.is_match(trimmed) && !indent {
            break;
        }
        body.push('\n');
        body.push_str(trimmed);
        started = true;
    }
    if body.is_empty() && !started {
        return None;
    }
    Some(body.trim().to_string())
}

pub fn parse_installed_size(s: &str) -> i64 {
    let s = s.trim();
    if s.is_empty() {
        return 0;
    }
    let (num, mult) = if let Some(v) = s.strip_suffix("KiB") {
        (v.trim(), 1024.0)
    } else if let Some(v) = s.strip_suffix("MiB") {
        (v.trim(), 1024.0 * 1024.0)
    } else if let Some(v) = s.strip_suffix("GiB") {
        (v.trim(), 1024.0 * 1024.0 * 1024.0)
    } else if let Some(v) = s.strip_suffix("TiB") {
        (v.trim(), 1024.0f64.powi(4))
    } else if let Some(v) = s.strip_suffix("B") {
        (v.trim(), 1.0)
    } else {
        (s, 1.0)
    };
    let f: f64 = num.trim().replace(',', ".").parse().unwrap_or(0.0);
    (f * mult) as i64
}

pub fn desktop_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/usr/share/applications"),
        PathBuf::from("/usr/local/share/applications"),
    ];
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        dirs.push(PathBuf::from(xdg).join("applications"));
    } else if let Ok(home) = std::env::var("HOME") {
        dirs.push(PathBuf::from(&home).join(".local/share/applications"));
    }
    dirs
}

pub fn desktop_files() -> Vec<PathBuf> {
    let mut out = Vec::new();
    for dir in desktop_dirs() {
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.extension().and_then(|x| x.to_str()) == Some("desktop") {
                    out.push(p);
                }
            }
        }
    }
    out.sort();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn field_block_captures_multiline() {
        let block = "\
Name        : sample
Summary     : A sample tool

Description: Full description line one
             continues here.
Other       : value
";
        let desc = field_block(block, "Description");
        assert_eq!(
            desc.as_deref(),
            Some("Full description line one\ncontinues here.")
        );
    }

    #[test]
    fn field_block_snap_yaml_style() {
        let block = "\
name:      sample
summary:   A sample
description: |
  Long text that
  spans two lines.
installed: 1.2.3 (5)
";
        let desc = field_block(block, "description");
        assert_eq!(desc.as_deref(), Some("Long text that\nspans two lines."));
    }

    #[test]
    fn field_block_stops_at_next_field() {
        let block = "Foo: a\nDescription: d1\nd2\nHomepage: http://x\n";
        let desc = field_block(block, "Description");
        assert_eq!(desc.as_deref(), Some("d1\nd2"));
    }
}
