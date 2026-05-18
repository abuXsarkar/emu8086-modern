// Tauri desktop + mobile entry for modern8051. Mirror of
// modern8086-desktop with the brand strings + URLs swapped.

#[cfg(desktop)]
use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
#[cfg(desktop)]
use tauri::Manager;
#[cfg(desktop)]
use tauri_plugin_opener::OpenerExt;

#[cfg(desktop)]
const DOCS_URL: &str = "https://modern8086.com/8051/docs/";
#[cfg(desktop)]
const ISSUES_URL: &str = "https://github.com/abuXsarkar/modern8086/issues/new";
const REPO_URL: &str = "https://github.com/abuXsarkar/modern8086";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build());

    #[cfg(desktop)]
    let builder = builder
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
        });

    builder
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(desktop)]
fn build_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    let app_about = AboutMetadataBuilder::new()
        .name(Some("modern8051"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .copyright(Some(
            "© Abu Sufian Sarkar. MIT-licensed. github.com/abuXsarkar/modern8086",
        ))
        .website(Some(REPO_URL))
        .website_label(Some("Project on GitHub"))
        .build();

    let app_submenu = SubmenuBuilder::new(app, "modern8051")
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

    let file_submenu = SubmenuBuilder::new(app, "File")
        .close_window()
        .quit()
        .build()?;

    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

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
