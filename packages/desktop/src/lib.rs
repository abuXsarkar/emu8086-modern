// Tauri desktop entry. Keeps `main()` thin so a future mobile entry
// (iOS / Android) can re-use `run()` from the same crate.
//
// No custom Rust commands yet: the IDE is fully client-side wasm and
// reaches its classroom service over a regular WebSocket. If we ever
// need native APIs (deep-link handling, file-system pick) they slot
// into `invoke_handler` here.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
