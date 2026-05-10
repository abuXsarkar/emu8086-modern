// Tauri desktop entry. Keeps `main()` thin so a future mobile entry
// (iOS / Android) can re-use `run()` from the same crate.
//
// No custom Rust commands yet: the IDE is fully client-side wasm and
// reaches its classroom service over a regular WebSocket. If we ever
// need native APIs (deep-link handling, file-system pick) they slot
// into `invoke_handler` here.
//
// Plugins:
//   - tauri-plugin-opener:          open external URLs in the user's
//                                   default browser. (Successor to
//                                   tauri-plugin-shell's deprecated
//                                   Shell::open path.)
//   - tauri-plugin-window-state:    remember window size + position
//                                   across launches.
//   - tauri-plugin-updater:         auto-update from GitHub Releases.
//                                   Compiled in; runtime check is
//                                   gated by `bundle.createUpdaterArtifacts`
//                                   and the updater endpoint config —
//                                   currently disabled until we have
//                                   a signing key, so this is a no-op
//                                   in practice.

use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

const DOCS_URL: &str = "https://github.com/abuXsarkar/emu8086-modern#readme";
const ISSUES_URL: &str = "https://github.com/abuXsarkar/emu8086-modern/issues/new";
const REPO_URL: &str = "https://github.com/abuXsarkar/emu8086-modern";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let opener = app.opener();
            match event.id().as_ref() {
                "documentation" => {
                    let _ = opener.open_url(DOCS_URL, None::<&str>);
                }
                "report_issue" => {
                    let _ = opener.open_url(ISSUES_URL, None::<&str>);
                }
                "view_on_github" => {
                    let _ = opener.open_url(REPO_URL, None::<&str>);
                }
                "reload" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.eval("window.location.reload()");
                    }
                }
                #[cfg(any(debug_assertions, feature = "devtools"))]
                "toggle_devtools" => {
                    if let Some(w) = app.get_webview_window("main") {
                        if w.is_devtools_open() {
                            w.close_devtools();
                        } else {
                            w.open_devtools();
                        }
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Build the native application menu.
///
/// macOS gets a proper top-bar menu; Linux/Windows show the same
/// items in a window menu bar. Most items use Tauri's predefined
/// menu items so they pick up the OS-native labels and keyboard
/// shortcuts automatically (Cmd+Q vs Ctrl+Q etc.).
fn build_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    // App menu — macOS only; the OS injects an "Application" menu
    // before the first user menu using the bundle's CFBundleName,
    // populated with whatever PredefinedMenuItems we add here.
    let app_about = AboutMetadataBuilder::new()
        .name(Some("emu8086-modern"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .copyright(Some(
            "© Abu Sufian Sarkar. MIT-licensed. github.com/abuXsarkar/emu8086-modern",
        ))
        .website(Some(REPO_URL))
        .website_label(Some("Project on GitHub"))
        .build();

    let app_submenu = SubmenuBuilder::new(app, "emu8086-modern")
        .about(Some(app_about.clone()))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    // File — minimal; the IDE's "open" flow is drag-and-drop into
    // the editor frame, so a native Open dialog would be redundant.
    // Close-window and Quit cover the OS-level expectation.
    let file_submenu = SubmenuBuilder::new(app, "File")
        .close_window()
        .quit()
        .build()?;

    // Edit — predefined items so OS shortcuts (Cmd+C / Ctrl+C, etc.)
    // map natively without us re-implementing them.
    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // View — reload + full-screen. (Zoom intentionally omitted: the
    // IDE already exposes density / layout controls inside the
    // Tweaks panel.) Devtools menu item only compiled in for debug
    // and the `devtools` feature — pairs exactly with the
    // toggle_devtools branch of the event handler, so we never
    // show a menu item whose handler isn't there.
    let reload_item = MenuItemBuilder::with_id("reload", "Reload").build(app)?;
    let view_builder = SubmenuBuilder::new(app, "View")
        .item(&reload_item)
        .separator()
        .fullscreen();

    #[cfg(any(debug_assertions, feature = "devtools"))]
    let view_builder = {
        let devtools_item =
            MenuItemBuilder::with_id("toggle_devtools", "Toggle Developer Tools").build(app)?;
        view_builder.separator().item(&devtools_item)
    };

    let view_submenu = view_builder.build()?;

    // Help — the educator-and-student-facing menu. About duplicated
    // here for non-macOS (where the platform-level app menu isn't
    // visible).
    let docs_item = MenuItemBuilder::with_id("documentation", "Documentation").build(app)?;
    let issue_item = MenuItemBuilder::with_id("report_issue", "Report an Issue…").build(app)?;
    let github_item = MenuItemBuilder::with_id("view_on_github", "View on GitHub").build(app)?;

    let help_submenu = SubmenuBuilder::new(app, "Help")
        .item(&docs_item)
        .item(&issue_item)
        .item(&github_item)
        .separator()
        .about(Some(app_about))
        .build()?;

    MenuBuilder::new(app)
        .items(&[
            &app_submenu,
            &file_submenu,
            &edit_submenu,
            &view_submenu,
            &help_submenu,
        ])
        .build()
}
