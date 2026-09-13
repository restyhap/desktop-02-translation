use std::env;
use std::io::{self, Write};
use std::time::{Duration, Instant};

const DOUBLE_TAP_WINDOW: Duration = Duration::from_millis(400);

struct State {
    key_to_detect: rdev::Key,
    last_press: Instant,
    count: u32,
    last_mouse_pos: Option<(f64, f64)>,
    ctrl_held: bool,
    meta_held: bool,
}

impl Default for State {
    fn default() -> Self {
        Self {
            key_to_detect: rdev::Key::KeyC,
            last_press: Instant::now() - DOUBLE_TAP_WINDOW,
            count: 0,
            last_mouse_pos: None,
            ctrl_held: false,
            meta_held: false,
        }
    }
}

fn is_modifier_key(key: &rdev::Key) -> bool {
    matches!(key, rdev::Key::ControlLeft | rdev::Key::ControlRight | rdev::Key::MetaLeft | rdev::Key::MetaRight)
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let key_config = if args.len() > 1 {
        args[1].clone()
    } else {
        "C".to_string()
    };

    let key_to_detect = parse_key(&key_config).unwrap_or(rdev::Key::KeyC);

    let mut state = State {
        key_to_detect,
        ..State::default()
    };
    let mut stdout = io::stdout();

    eprintln!("[hook] keyboard-hook started, key={:?}", state.key_to_detect);

    if let Err(e) = rdev::listen(move |event| match event.event_type {
        rdev::EventType::KeyPress(key) => {
            if is_modifier_key(&key) {
                match key {
                    rdev::Key::ControlLeft | rdev::Key::ControlRight => state.ctrl_held = true,
                    rdev::Key::MetaLeft | rdev::Key::MetaRight => state.meta_held = true,
                    _ => {}
                }
                return;
            }
            if key == state.key_to_detect {
                if !state.ctrl_held && !state.meta_held {
                    return;
                }
                let now = Instant::now();
                let gap = now.duration_since(state.last_press);

                if gap < DOUBLE_TAP_WINDOW {
                    state.count += 1;
                } else {
                    state.count = 1;
                }
                state.last_press = now;

                if state.count >= 2 {
                    state.count = 0;
                    eprintln!("[hook] >>> SENDING TRANSLATE");
                    let (x, y) = state.last_mouse_pos.unwrap_or((0.0, 0.0));
                    let _ = writeln!(stdout, "TRANSLATE {} {}", x, y);
                    let _ = stdout.flush();
                }
            }
        }
        rdev::EventType::KeyRelease(key) => {
            if is_modifier_key(&key) {
                match key {
                    rdev::Key::ControlLeft | rdev::Key::ControlRight => state.ctrl_held = false,
                    rdev::Key::MetaLeft | rdev::Key::MetaRight => state.meta_held = false,
                    _ => {}
                }
            }
        }
        rdev::EventType::MouseMove { x, y } => {
            state.last_mouse_pos = Some((x, y));
        }
        _ => {}
    }) {
        eprintln!("rdev error: {:?}", e);
        eprintln!("Grant Accessibility: System Settings > Privacy > Accessibility");
        std::process::exit(1);
    }
}

fn parse_key(key_str: &str) -> Option<rdev::Key> {
    match key_str.to_uppercase().as_str() {
        "A" => Some(rdev::Key::KeyA),
        "B" => Some(rdev::Key::KeyB),
        "C" => Some(rdev::Key::KeyC),
        "D" => Some(rdev::Key::KeyD),
        "E" => Some(rdev::Key::KeyE),
        "F" => Some(rdev::Key::KeyF),
        "G" => Some(rdev::Key::KeyG),
        "H" => Some(rdev::Key::KeyH),
        "I" => Some(rdev::Key::KeyI),
        "J" => Some(rdev::Key::KeyJ),
        "K" => Some(rdev::Key::KeyK),
        "L" => Some(rdev::Key::KeyL),
        "M" => Some(rdev::Key::KeyM),
        "N" => Some(rdev::Key::KeyN),
        "O" => Some(rdev::Key::KeyO),
        "P" => Some(rdev::Key::KeyP),
        "Q" => Some(rdev::Key::KeyQ),
        "R" => Some(rdev::Key::KeyR),
        "S" => Some(rdev::Key::KeyS),
        "T" => Some(rdev::Key::KeyT),
        "U" => Some(rdev::Key::KeyU),
        "V" => Some(rdev::Key::KeyV),
        "W" => Some(rdev::Key::KeyW),
        "X" => Some(rdev::Key::KeyX),
        "Y" => Some(rdev::Key::KeyY),
        "Z" => Some(rdev::Key::KeyZ),
        _ => None,
    }
}
