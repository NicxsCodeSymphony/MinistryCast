use std::time::Duration;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn presentation_id(path: &str) -> String {
    path.split("presentation=")
        .nth(1)
        .map(|value| {
            value
                .split(['&', '#', '/'])
                .next()
                .unwrap_or(value)
                .trim()
                .to_string()
        })
        .unwrap_or_default()
}

fn projector_init_script(id: &str) -> String {
    let json = serde_json::to_string(id).unwrap_or_else(|_| "\"\"".into());
    format!(
        r##"
        (function () {{
          try {{
            window.__MC_IS_PROJECTOR__ = true;
            window.__MC_OUTPUT__ = {json};
            sessionStorage.setItem("mc.outputPresentation", {json});
            if ({json} && !String(location.hash || "").includes("/output")) {{
              location.hash = "#/output?presentation=" + encodeURIComponent({json});
            }}
          }} catch (e) {{}}
        }})();
        "##
    )
}

fn projector_url(id: &str) -> WebviewUrl {
    if id.is_empty() {
        WebviewUrl::App("index.html#/output".into())
    } else {
        WebviewUrl::App(
            format!(
                "index.html#/output?presentation={}",
                urlencoding_lite(id)
            )
            .into(),
        )
    }
}

/// Minimal percent-encoding for presentation ids in the hash URL.
fn urlencoding_lite(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for b in value.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn focus_operator(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

fn place_projector(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();

    let Ok(monitors) = app.available_monitors() else {
        focus_operator(app);
        return;
    };
    let operator_monitor = app
        .get_webview_window("main")
        .and_then(|main| main.current_monitor().ok().flatten());
    let target = monitors.iter().find(|monitor| {
        operator_monitor
            .as_ref()
            .map(|item| item.position() != monitor.position())
            .unwrap_or(true)
    });

    if let Some(monitor) = target {
        let _ = window.set_always_on_top(true);
        let _ = window.set_decorations(false);
        let _ = window.set_fullscreen(false);
        let _ = window.set_position(tauri::Position::Physical(*monitor.position()));
        let _ = window.set_size(tauri::Size::Physical(*monitor.size()));
    } else {
        // One display: keep a windowed output so the operator console stays usable.
        let _ = window.set_always_on_top(false);
        let _ = window.set_fullscreen(false);
        let _ = window.set_decorations(true);
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(960.0, 540.0)));
        if let Some(main) = app.get_webview_window("main") {
            if let Ok(pos) = main.outer_position() {
                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: pos.x + 72,
                    y: pos.y + 72,
                }));
            }
        }
    }

    let _ = window.show();
    focus_operator(app);
}

fn schedule_place_projector(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(250));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(window) = handle.get_webview_window("projector") {
                place_projector(&handle, &window);
            }
        });
    });
}

#[tauri::command]
async fn open_projector(app: tauri::AppHandle, path: String) -> Result<(), String> {
    // Must be async on Windows: sync WebviewWindowBuilder::build deadlocks WebView2
    // and leaves a frozen white projector window (works on macOS WKWebView).
    let id = presentation_id(&path);
    if let Some(existing) = app.get_webview_window("projector") {
        if !id.is_empty() {
            let script = format!(
                r##"
                try {{
                  window.__MC_IS_PROJECTOR__ = true;
                  sessionStorage.setItem("mc.outputPresentation", {id});
                  window.__MC_OUTPUT__ = {id};
                  location.hash = "#/output?presentation=" + encodeURIComponent({id});
                }} catch (e) {{}}
                "##,
                id = serde_json::to_string(&id).unwrap_or_else(|_| "\"\"".into())
            );
            let _ = existing.eval(&script);
        }
        place_projector(&app, &existing);
        schedule_place_projector(app);
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(&app, "projector", projector_url(&id))
        .title("MinistryCast Output")
        .decorations(true)
        .resizable(true)
        .fullscreen(false)
        .always_on_top(false)
        .visible(false)
        .focused(false)
        .inner_size(960.0, 540.0)
        .initialization_script(&projector_init_script(&id))
        .build()
        .map_err(|err| err.to_string())?;

    place_projector(&app, &window);
    schedule_place_projector(app);
    Ok(())
}

#[tauri::command]
fn close_projector(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("projector") {
        window.close().map_err(|err| err.to_string())?;
    }
    focus_operator(&app);
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
