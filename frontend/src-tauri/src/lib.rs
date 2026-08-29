use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn place_projector(app: &tauri::AppHandle, window: &tauri::WebviewWindow) -> Result<(), String> {
    let _ = window.set_fullscreen(false);
    let monitors = app.available_monitors().map_err(|err| err.to_string())?;
    let primary = app.primary_monitor().ok().flatten();
    let target = monitors
        .iter()
        .find(|monitor| {
            primary
                .as_ref()
                .map(|item| item.position() != monitor.position())
                .unwrap_or(true)
        })
        .or_else(|| monitors.first());

    if let Some(monitor) = target {
        let _ = window.set_position(tauri::Position::Physical(*monitor.position()));
        let _ = window.set_size(tauri::Size::Physical(*monitor.size()));
    }
    Ok(())
}

#[tauri::command]
fn open_projector(app: tauri::AppHandle, path: String) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("projector") {
        place_projector(&app, &existing)?;
        let _ = existing.set_focus();
        return Ok(());
    }

    let url = path.trim_start_matches('/').to_string();
    let window = WebviewWindowBuilder::new(&app, "projector", WebviewUrl::App(url.into()))
        .title("MinistryCast Output")
        .decorations(false)
        .resizable(false)
        .fullscreen(false)
        .always_on_top(false)
        .visible(true)
        .build()
        .map_err(|err| err.to_string())?;

    place_projector(&app, &window)?;
    Ok(())
}

#[tauri::command]
fn close_projector(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("projector") {
        window.close().map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let work = monitor.work_area();
                    let _ = window.set_size(tauri::Size::Physical(work.size));
                    let _ = window.set_position(tauri::Position::Physical(work.position));
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            open_projector,
            close_projector
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
