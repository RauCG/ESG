#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Ajusta el entorno gráfico automáticamente para que el binario arranque en
/// cualquier equipo sin variables manuales:
/// - En sesiones Wayland se desactiva el renderer DMABUF de WebKit
///   (provoca `Error 71 dispatching to Wayland display` según el driver).
/// - Si además hay XWayland (`DISPLAY` presente), se fuerza `GDK_BACKEND=x11`,
///   más estable con WebKitGTK.
/// Nunca se pisa lo que el usuario haya fijado explícitamente.
fn tune_graphics_env() {
    let wayland = std::env::var("WAYLAND_DISPLAY").is_ok()
        || std::env::var("XDG_SESSION_TYPE").map(|v| v == "wayland").unwrap_or(false);
    if !wayland {
        return;
    }
    if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    if std::env::var("DISPLAY").is_ok() && std::env::var("GDK_BACKEND").is_err() {
        std::env::set_var("GDK_BACKEND", "x11");
    }
}

fn main() {
    tune_graphics_env();
    esg_lib::run()
}