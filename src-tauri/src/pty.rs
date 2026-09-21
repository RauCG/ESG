use crate::model::PtsEvent;
use crate::util;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

const CAPTURE_LIMIT: usize = 128 * 1024;

#[allow(dead_code)]
pub struct PtsSession {
    pub id: u32,
    pub label: String,
    pub kind: String,
    master: Arc<Mutex<Box<dyn MasterPty + Send + 'static>>>,
    writer: Arc<Mutex<Box<dyn Write + Send + 'static>>>,
    child: Mutex<Option<Box<dyn Child + Send + Sync + 'static>>>,
    capture: Mutex<Vec<u8>>,
    listeners: Mutex<Vec<Channel<PtsEvent>>>,
    alive: AtomicBool,
}

impl PtsSession {
    pub fn alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }

    pub fn resize(&self, cols: u16, rows: u16) {
        if let Ok(m) = self.master.lock() {
            let _ = m.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 });
        }
    }

    pub fn write(&self, data: &[u8]) -> Result<(), String> {
        let mut w = self.writer.lock().map_err(|e| e.to_string())?;
        w.write_all(data).map_err(|e| e.to_string())?;
        w.flush().map_err(|e| e.to_string())
    }

    pub fn attach(&self, channel: Channel<PtsEvent>) -> Result<(), String> {
        let snapshot = self.capture.lock().unwrap().clone();
        {
            let mut l = self.listeners.lock().unwrap();
            if l.iter().any(|c| c.id() == channel.id()) {
                return Ok(());
            }
            l.push(channel.clone());
        }
        if !snapshot.is_empty() {
            let _ = channel.send(PtsEvent::Data { id: self.id, data: snapshot });
        }
        Ok(())
    }

    pub fn broadcast(&self, ev: PtsEvent) {
        let listeners = self.listeners.lock().unwrap().clone();
        for l in listeners {
            let _ = l.send(ev.clone());
        }
    }

    pub fn kill(&self) {
        if let Some(mut c) = self.child.lock().unwrap().take() {
            let _ = c.kill();
            let _ = c.wait();
        }
        self.alive.store(false, Ordering::SeqCst);
    }
}

#[derive(Default)]
pub struct PtsState {
    pub sessions: Mutex<HashMap<u32, Arc<PtsSession>>>,
}

impl PtsState {
    pub fn new() -> Self {
        PtsState { sessions: Mutex::new(HashMap::new()) }
    }

    pub fn next_id(&self) -> u32 {
        let s = self.sessions.lock().unwrap();
        let mut id = 1000u32;
        while s.contains_key(&id) {
            id += 1;
        }
        id
    }

    pub fn session(&self, id: u32) -> Option<Arc<PtsSession>> {
        self.sessions.lock().unwrap().get(&id).cloned()
    }
}

pub struct SpawnSpec {
    pub label: String,
    pub kind: String,
    pub cwd: Option<PathBuf>,
    pub exec: Option<String>,
    pub interactive: bool,
}

/// Añade la transcripción de una operación al fichero de diagnóstico.
/// Solo se usa para kind=="op". Guarda los últimos ~8 KB de salida.
fn log_op_transcript(id: u32, label: &str, success: bool, code: Option<i32>, capture: &[u8]) {
    let path = std::env::temp_dir().join("esg-ops.log");
    let tail = if capture.len() > 8192 {
        &capture[capture.len() - 8192..]
    } else {
        capture
    };
    let text = String::from_utf8_lossy(tail);
    let entry = format!(
        "=== op id={id} label='{label}' success={success} code={code:?} ===\n{text}\n=== fin op {id} ===\n"
    );
    use std::io::Write;
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .mode(0o600)
            .open(&path)
        {
            let _ = f.write_all(entry.as_bytes());
        }
    }
    #[cfg(not(unix))]
    {
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = f.write_all(entry.as_bytes());
        }
    }
}

pub fn spawn_shell(state: &PtsState, spec: SpawnSpec) -> Result<u32, String> {
    let pty = native_pty_system()
        .openpty(PtySize { rows: 40, cols: 120, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("Error creando PTY: {e}"))?;
    let (master, slave) = (pty.master, pty.slave);

    let shell = util::shell();
    let cwd = spec.cwd.clone().unwrap_or_else(|| {
        std::env::var("HOME").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("/"))
    });

    let mut cmd = CommandBuilder::new(&shell);
    cmd.env("TERM", "xterm-256color");
    cmd.env("LC_ALL", "C");
    cmd.env("LANG", "C");
    cmd.env("LANGUAGE", "C");
    cmd.cwd(&cwd);
    if let Some(script) = spec.exec {
        cmd.arg("-lc");
        cmd.arg(script);
    } else if spec.interactive {
        cmd.arg("-l");
    }

    let child = slave.spawn_command(cmd).map_err(|e| format!("No se puede lanzar {shell}: {e}"))?;
    drop(slave);

    let reader = master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = master.take_writer().map_err(|e| e.to_string())?;

    let id = state.next_id();
    let session = Arc::new(PtsSession {
        id,
        label: spec.label,
        kind: spec.kind,
        master: Arc::new(Mutex::new(master)),
        writer: Arc::new(Mutex::new(writer)),
        child: Mutex::new(Some(child)),
        capture: Mutex::new(Vec::new()),
        listeners: Mutex::new(Vec::new()),
        alive: AtomicBool::new(true),
    });
    state.sessions.lock().unwrap().insert(id, session.clone());

    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut reader = reader;
        loop {
            if !session.alive() {
                break;
            }
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = buf[..n].to_vec();
                    {
                        let mut cap = session.capture.lock().unwrap();
                        cap.extend_from_slice(&chunk);
                        if cap.len() > CAPTURE_LIMIT {
                            let drop_n = cap.len() - CAPTURE_LIMIT;
                            cap.drain(..drop_n);
                        }
                    }
                    session.broadcast(PtsEvent::Data { id: session.id, data: chunk });
                }
                Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }
        let status = session.child.lock().unwrap().take().and_then(|mut c| c.wait().ok());
        session.alive.store(false, Ordering::SeqCst);
        let (code, success) = match status {
            Some(s) => {
                let success = s.success();
                let code = s.exit_code();
                let code = if success { Some(0) } else { Some(code as i32) };
                (code, success)
            }
            None => (None, false),
        };
        // Registrar la transcripción de las operaciones en un fichero local
        // para poder diagnosticar fallos sin depender del panel del frontend.
        // Solo kind=="op" (nunca terminales libres). La contraseña de sudo no
        // aparece: sudo la lee sin echo en el PTY.
        if session.kind == "op" {
            let cap = session.capture.lock().unwrap().clone();
            log_op_transcript(session.id, &session.label, success, code, &cap);
        }
        session.broadcast(PtsEvent::Exit { id: session.id, success, code, signal: None });
    });

    Ok(id)
}