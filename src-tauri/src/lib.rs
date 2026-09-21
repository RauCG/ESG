mod detect;
mod model;
mod ops;
mod packages;
mod pty;
mod settings;
mod sudo;
mod util;

use model::{ListResult, OpRequest, PkgDetails, PtsEvent, SearchResult, Settings, SystemInfo};
use pty::{spawn_shell, PtsState, SpawnSpec};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
fn system_info() -> SystemInfo {
    detect::detect_system()
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Settings {
    settings::load(&app)
}

#[tauri::command]
fn save_settings(app: AppHandle, s: Settings) -> Result<(), String> {
    settings::save(&app, &s)
}

#[tauri::command]
fn detect_managers(family: String) -> Vec<model::ManagerInfo> {
    let mut managers = model::all_managers();
    for m in managers.iter_mut() {
        m.detected = util::command_exists(&m.id);
    }
    settings::apply_family_defaults(&family, &mut managers);
    managers
}

#[tauri::command]
fn list_packages(app: AppHandle, show_dependencies: bool) -> ListResult {
    packages::list_packages(&app, show_dependencies)
}

#[tauri::command]
fn list_updates(app: AppHandle, manager: String) -> Result<Vec<model::Pkg>, String> {
    packages::list_updates(&app, &manager)
}

#[tauri::command]
fn search_packages(app: AppHandle, query: String) -> Vec<SearchResult> {
    packages::search_packages(&app, &query)
}

#[tauri::command]
fn package_details(app: AppHandle, manager: String, name: String) -> Result<PkgDetails, String> {
    packages::package_details(&app, &manager, &name)
}

#[tauri::command]
fn get_orphans(app: AppHandle) -> Vec<model::Pkg> {
    packages::get_orphans(&app)
}

#[tauri::command]
fn get_cache_info(app: AppHandle) -> Vec<model::CacheInfo> {
    packages::get_cache_info(&app)
}

#[tauri::command]
fn launch_app(name: String) -> Result<(), String> {
    ops::launch_desktop(&name)
}

#[tauri::command]
fn sudo_status() -> (bool, String) {
    let user = sudo::user();
    let ok = sudo::ok_now();
    (ok, user)
}

#[tauri::command]
fn verify_sudo(password: String) -> Result<(), String> {
    sudo::verify_password(&password)
}

// ---------------- PTY / Terminal ----------------

#[tauri::command]
fn pty_create(state: State<PtsState>, label: String, exec: Option<String>) -> Result<u32, String> {
    let exec = exec.map(|e| format!("{e}; exec {}", util::shell()));
    spawn_shell(&state, SpawnSpec {
        label,
        kind: "term".into(),
        cwd: None,
        exec,
        interactive: true,
    })
}

#[tauri::command]
fn pty_attach(id: u32, on_event: Channel<PtsEvent>, state: State<PtsState>) -> Result<(), String> {
    let s = state.session(id).ok_or("Sesión de terminal no encontrada")?;
    s.attach(on_event)
}

#[tauri::command]
fn pty_write(id: u32, data: Vec<u8>, state: State<PtsState>) -> Result<(), String> {
    let s = state.session(id).ok_or("Sesión de terminal no encontrada")?;
    s.write(&data)
}

#[tauri::command]
fn pty_resize(id: u32, cols: u16, rows: u16, state: State<PtsState>) -> Result<(), String> {
    if let Some(s) = state.session(id) {
        s.resize(cols, rows);
    }
    Ok(())
}

#[tauri::command]
fn pty_close(id: u32, state: State<PtsState>) -> Result<(), String> {
    if let Some(s) = state.session(id) {
        s.kill();
    }
    state.sessions.lock().unwrap().remove(&id);
    Ok(())
}

// ---------------- Operaciones ----------------

#[tauri::command]
fn op_start(
    app: AppHandle,
    state: State<PtsState>,
    request: OpRequest,
    on_event: Channel<PtsEvent>,
) -> Result<u32, String> {
    let id = ops::start_op(&app, &state, request)?;
    let s = state.session(id).ok_or("Sesión de operación no encontrada")?;
    s.attach(on_event)?;
    Ok(id)
}

#[tauri::command]
fn op_cancel(id: u32, state: State<PtsState>) -> Result<(), String> {
    if let Some(s) = state.session(id) {
        let _ = s.write(&[3u8, 0u8]);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(PtsState::new())
        .invoke_handler(tauri::generate_handler![
            system_info,
            get_settings,
            save_settings,
            detect_managers,
            list_packages,
            list_updates,
            search_packages,
            package_details,
            get_orphans,
            get_cache_info,
            launch_app,
            sudo_status,
            verify_sudo,
            pty_create,
            pty_attach,
            pty_write,
            pty_resize,
            pty_close,
            op_start,
            op_cancel,
        ])
        .build(tauri::generate_context!())
        .expect("error al construir ESG");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            let state = handle.state::<PtsState>();
            let ids: Vec<u32> = state.sessions.lock().unwrap().keys().copied().collect();
            for id in ids {
                if let Some(s) = state.session(id) {
                    s.kill();
                }
            }
        }
    });
}