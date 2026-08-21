use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::MacosLauncher;

const API_BASE: &str = "http://127.0.0.1:8000";
const OLLAMA_BASE: &str = "http://127.0.0.1:11434";

fn ensure_overlay_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    if app.get_webview_window("overlay").is_some() {
        return Ok(());
    }

    let mut width = 420.0;
    let mut height = 260.0;
    let mut x = 24.0;
    let mut y = 24.0;

    if let Some(monitor) = app.primary_monitor()? {
        let size = monitor.size();
        let max_area = (size.width as f64 * size.height as f64) / 10.0;
        let preferred_area = width * height;
        if preferred_area > max_area {
            let scale = (max_area / preferred_area).sqrt();
            width *= scale;
            height *= scale;
        }
        x = size.width as f64 - width - 28.0;
        y = size.height as f64 - height - 48.0;
    }

    WebviewWindowBuilder::new(
        app,
        "overlay",
        WebviewUrl::App("/?overlay=1".into()),
    )
    .title("Jarvis Overlay")
    .inner_size(width, height)
    .min_inner_size(360.0, 220.0)
    .position(x, y)
    .decorations(false)
    .resizable(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .transparent(true)
    .visible(false)
    .build()?;

    Ok(())
}

fn toggle_overlay_window(app: &tauri::AppHandle) {
    if ensure_overlay_window(app).is_err() {
        return;
    }
    if let Some(window) = app.get_webview_window("overlay") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[tauri::command]
fn get_api_base() -> String {
    API_BASE.to_string()
}

#[tauri::command]
async fn get_setup_status() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();

    let ollama_ready = client
        .get(format!("{}/api/tags", OLLAMA_BASE))
        .send()
        .await
        .map(|resp| resp.status().is_success())
        .unwrap_or(false);

    let server_ready = client
        .get(format!("{}/health", API_BASE))
        .send()
        .await
        .map(|resp| resp.status().is_success())
        .unwrap_or(false);

    let model_ready = if ollama_ready {
        match client.get(format!("{}/api/tags", OLLAMA_BASE)).send().await {
            Ok(resp) => match resp.json::<serde_json::Value>().await {
                Ok(json) => json
                    .get("models")
                    .and_then(|m| m.as_array())
                    .map(|models| !models.is_empty())
                    .unwrap_or(false),
                Err(_) => false,
            },
            Err(_) => false,
        }
    } else {
        false
    };

    let (phase, detail, error) = if server_ready && model_ready && ollama_ready {
        ("ready", "Local AI stack is ready.", serde_json::Value::Null)
    } else if !ollama_ready {
        ("starting", "Waiting for Ollama...", serde_json::Value::Null)
    } else if !model_ready {
        ("starting", "Waiting for AI model...", serde_json::Value::Null)
    } else if !server_ready {
        ("starting", "Waiting for API server...", serde_json::Value::Null)
    } else {
        ("starting", "Waiting...", serde_json::Value::Null)
    };

    Ok(serde_json::json!({
        "phase": phase,
        "detail": detail,
        "ollama_ready": ollama_ready,
        "server_ready": server_ready,
        "model_ready": model_ready,
        "error": error,
    }))
}

/// Fetch health status from the OpenJarvis API server.
#[tauri::command]
async fn check_health(api_url: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/health", api_url);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

/// Fetch energy monitoring data from the API.
#[tauri::command]
async fn fetch_energy(api_url: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/v1/telemetry/energy", api_url);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

/// Fetch telemetry statistics from the API.
#[tauri::command]
async fn fetch_telemetry(api_url: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/v1/telemetry/stats", api_url);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

/// Fetch recent traces from the API.
#[tauri::command]
async fn fetch_traces(api_url: String, limit: u32) -> Result<serde_json::Value, String> {
    let url = format!("{}/v1/traces?limit={}", api_url, limit);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

/// Fetch a single trace by ID.
#[tauri::command]
async fn fetch_trace(api_url: String, trace_id: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/v1/traces/{}", api_url, trace_id);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

/// Fetch learning system statistics.
#[tauri::command]
async fn fetch_learning_stats(api_url: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/v1/learning/stats", api_url);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

/// Fetch learning policy configuration.
#[tauri::command]
async fn fetch_learning_policy(api_url: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/v1/learning/policy", api_url);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

/// Fetch memory backend statistics.
#[tauri::command]
async fn fetch_memory_stats(api_url: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/v1/memory/stats", api_url);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

/// Search memory for relevant chunks.
#[tauri::command]
async fn search_memory(
    api_url: String,
    query: String,
    top_k: u32,
) -> Result<serde_json::Value, String> {
    let url = format!("{}/v1/memory/search", api_url);
    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .json(&serde_json::json!({"query": query, "top_k": top_k}))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

/// Fetch list of available agents.
#[tauri::command]
async fn fetch_agents(api_url: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/v1/agents", api_url);
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

/// Proxy chat completion through the Rust backend (avoids WebView CORS issues).
#[tauri::command]
async fn chat_completion(api_url: String, request: serde_json::Value) -> Result<serde_json::Value, String> {
    let url = format!("{}/v1/chat/completions", api_url);
    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;
    Ok(body)
}

/// Generic JSON API proxy for desktop frontend requests.
#[tauri::command]
async fn api_json_request(
    api_url: String,
    method: String,
    path: String,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let url = format!(
        "{}/{}",
        api_url.trim_end_matches('/'),
        path.trim_start_matches('/')
    );
    let client = reqwest::Client::new();
    let method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|e| format!("Invalid method: {}", e))?;

    let mut req = client.request(method, &url);
    if let Some(payload) = body {
        req = req.json(&payload);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;

    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status.as_u16(), text));
    }

    serde_json::from_str(&text).map_err(|e| format!("Invalid JSON: {}", e))
}

/// Launch the `jarvis` CLI command via shell.
#[tauri::command]
async fn run_jarvis_command(args: Vec<String>) -> Result<String, String> {
    let output = tokio::process::Command::new("jarvis")
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Failed to launch jarvis: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the main window if another instance is launched
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let show = MenuItemBuilder::with_id("show", "Show / Hide")
                .build(app)?;
            let overlay = MenuItemBuilder::with_id("overlay", "Toggle Overlay")
                .build(app)?;
            let health = MenuItemBuilder::with_id("health", "Health: checking...")
                .enabled(false)
                .build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit OpenJarvis")
                .build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show)
                .item(&overlay)
                .separator()
                .item(&health)
                .separator()
                .item(&quit)
                .build()?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("OpenJarvis")
                .menu(&menu)
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        "overlay" => {
                            toggle_overlay_window(app);
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            ensure_overlay_window(&app.handle())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_api_base,
            get_setup_status,
            check_health,
            fetch_energy,
            fetch_telemetry,
            fetch_traces,
            fetch_trace,
            fetch_learning_stats,
            fetch_learning_policy,
            fetch_memory_stats,
            search_memory,
            fetch_agents,
            chat_completion,
            api_json_request,
            run_jarvis_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenJarvis Desktop");
}
