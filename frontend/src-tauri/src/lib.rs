use std::time::Duration;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn projector_hash(path: &str) -> String {
    let trimmed = path.trim().trim_start_matches('/');
    let trimmed = trimmed.strip_prefix("index.html").unwrap_or(trimmed);
    let trimmed = trimmed.trim_start_matches('#');
    let trimmed = trimmed.trim_start_matches('/');
    format!("#/{trimmed}")
}

fn projector_asset_url(path: &str) -> String {
    format!("index.html{}", projector_hash(path))
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
        #[cfg(windows)]
        {
            let _ = window.set_size(tauri::Size::Physical(*monitor.size()));
            let _ = window.set_fullscreen(true);
        }
        #[cfg(not(windows))]
        {
            let _ = window.set_size(tauri::Size::Physical(*monitor.size()));
        }
    }
    let _ = window.show();
    Ok(())
}

fn schedule_place_projector(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(350));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(window) = handle.get_webview_window("projector") {
                let _ = place_projector(&handle, &window);
            }
        });
    });
}

#[tauri::command]
fn open_projector(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let hash = projector_hash(&path);
    if let Some(existing) = app.get_webview_window("projector") {
        let _ = existing.eval(&format!("location.hash = {hash:?}"));
        place_projector(&app, &existing)?;
        #[cfg(windows)]
        schedule_place_projector(app.clone());
        let _ = existing.set_focus();
        return Ok(());
    }

    let url = projector_asset_url(&path);
    let mut builder = WebviewWindowBuilder::new(&app, "projector", WebviewUrl::App(url.into()))
        .title("MinistryCast Output")
        .decorations(false)
        .fullscreen(false)
        .always_on_top(false)
        .focused(false)
        .visible(false)
        .initialization_script(&format!(
            "if (!location.hash || location.hash.indexOf('#/output') !== 0) location.hash = {hash:?};"
        ));

    #[cfg(windows)]
    {
        builder = builder.resizable(true);
    }
    #[cfg(not(windows))]
    {
        builder = builder.resizable(false);
    }

    let window = builder.build().map_err(|err| err.to_string())?;
    place_projector(&app, &window)?;
    #[cfg(windows)]
    schedule_place_projector(app);
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
