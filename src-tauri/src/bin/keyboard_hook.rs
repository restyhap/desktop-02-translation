use std::io::{self, Write};
use std::time::{Duration, Instant};

const DOUBLE_TAP_WINDOW: Duration = Duration::from_millis(400);

struct State {
    cmd_held: bool,
    last_c: Instant,
    count: u32,
}

impl Default for State {
    fn default() -> Self {
        Self {
            cmd_held: false,
            last_c: Instant::now() - DOUBLE_TAP_WINDOW,
            count: 0,
        }
    }
}

fn main() {
    let mut state = State::default();
    let mut stdout = io::stdout();

    eprintln!("[hook] keyboard-hook started, PID={}", std::process::id());

    if let Err(e) = rdev::listen(move |event| {
        match event.event_type {
            rdev::EventType::KeyPress(rdev::Key::MetaLeft | rdev::Key::MetaRight) => {
                state.cmd_held = true;
                eprintln!("[hook] Cmd DOWN, count={}", state.count);
            }
            rdev::EventType::KeyRelease(rdev::Key::MetaLeft | rdev::Key::MetaRight) => {
                eprintln!("[hook] Cmd UP, resetting state");
                state.cmd_held = false;
                state.count = 0;
            }
            rdev::EventType::KeyPress(rdev::Key::KeyC) if state.cmd_held => {
                let now = Instant::now();
                let gap = now.duration_since(state.last_c);
                if gap < DOUBLE_TAP_WINDOW {
                    state.count += 1;
                } else {
                    state.count = 1;
                }
                state.last_c = now;

                eprintln!(
                    "[hook] C press, count={}, gap={:?}",
                    state.count, gap
                );

                if state.count >= 2 {
                    state.count = 0;
                    eprintln!("[hook] >>> SENDING TRANSLATE");
                    let _ = writeln!(stdout, "TRANSLATE");
                    let _ = stdout.flush();
                }
            }
            _ => {}
        }
    }) {
        eprintln!("rdev error: {:?}", e);
        eprintln!("Grant Accessibility: System Settings > Privacy > Accessibility");
        std::process::exit(1);
    }
}
