// Hide the console window on Windows release builds. The webview
// shows the UI; a parallel cmd.exe would be useless noise. Debug
// builds keep the console attached so panics are still visible.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    modern8086_desktop_lib::run()
}
