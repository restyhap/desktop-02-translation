use std::env;
use std::io::{self, Write};
use std::time::{Duration, Instant};

// 窗口：相邻按键的最大间隔
const SEQ_WINDOW: Duration = Duration::from_millis(500);

struct State {
    key_sequence: Vec<rdev::Key>,
    match_index: usize,
    last_press: Instant,
    last_mouse_pos: Option<(f64, f64)>,
    ctrl_held: bool,
    meta_held: bool,
}

impl Default for State {
    fn default() -> Self {
        Self {
            key_sequence: vec![rdev::Key::KeyC],
            match_index: 0,
            last_press: Instant::now() - SEQ_WINDOW,
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
    // 参数格式: "C,D" 或 "C,C"（按键序列，逗号分隔）
    let seq_arg = if args.len() > 1 {
        args[1].clone()
    } else {
        "C".to_string()
    };

    let key_sequence: Vec<rdev::Key> = seq_arg
        .split(',')
        .filter_map(|s| parse_key(s.trim()))
        .collect();

    if key_sequence.is_empty() {
        eprintln!("[hook] 无效的按键序列: {}", seq_arg);
        std::process::exit(1);
    }

    let mut state = State {
        key_sequence,
        ..State::default()
    };
    let mut stdout = io::stdout();

    eprintln!(
        "[hook] keyboard-hook started, sequence={:?}",
        state.key_sequence
    );

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

            // 非修饰键按下：必须是序列中的下一个键，且修饰键处于按下状态
            if !(state.ctrl_held || state.meta_held) {
                // 未持修饰键时按普通键，重置匹配
                state.match_index = 0;
                return;
            }

            let expected = &state.key_sequence[state.match_index];
            if key == *expected {
                let now = Instant::now();
                let gap = now.duration_since(state.last_press);

                state.match_index += 1;
                state.last_press = now;

                // 窗口超界：重置
                if gap > SEQ_WINDOW {
                    state.match_index = 0;
                }

                // 序列完整匹配
                if state.match_index >= state.key_sequence.len() {
                    state.match_index = 0;
                    eprintln!("[hook] >>> SENDING TRANSLATE");
                    let (x, y) = state.last_mouse_pos.unwrap_or((0.0, 0.0));
                    let _ = writeln!(stdout, "TRANSLATE {} {}", x, y);
                    let _ = stdout.flush();
                }
            } else {
                // 按了非预期键，重置匹配
                state.match_index = 0;
            }
        }
        rdev::EventType::KeyRelease(key) => {
            if is_modifier_key(&key) {
                match key {
                    rdev::Key::ControlLeft | rdev::Key::ControlRight => state.ctrl_held = false,
                    rdev::Key::MetaLeft | rdev::Key::MetaRight => state.meta_held = false,
                    _ => {}
                }
                // 修饰键抬起时重置匹配（按下字母键时功能键必须处于按下状态）
                state.match_index = 0;
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
    let upper = key_str.to_uppercase();
    match upper.as_str() {
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
        "0" => Some(rdev::Key::Num0),
        "1" => Some(rdev::Key::Num1),
        "2" => Some(rdev::Key::Num2),
        "3" => Some(rdev::Key::Num3),
        "4" => Some(rdev::Key::Num4),
        "5" => Some(rdev::Key::Num5),
        "6" => Some(rdev::Key::Num6),
        "7" => Some(rdev::Key::Num7),
        "8" => Some(rdev::Key::Num8),
        "9" => Some(rdev::Key::Num9),
        "F1" => Some(rdev::Key::F1),
        "F2" => Some(rdev::Key::F2),
        "F3" => Some(rdev::Key::F3),
        "F4" => Some(rdev::Key::F4),
        "F5" => Some(rdev::Key::F5),
        "F6" => Some(rdev::Key::F6),
        "F7" => Some(rdev::Key::F7),
        "F8" => Some(rdev::Key::F8),
        "F9" => Some(rdev::Key::F9),
        "F10" => Some(rdev::Key::F10),
        "F11" => Some(rdev::Key::F11),
        "F12" => Some(rdev::Key::F12),
        "SPACE" => Some(rdev::Key::Space),
        "ENTER" => Some(rdev::Key::Return),
        "ESCAPE" => Some(rdev::Key::Escape),
        "TAB" => Some(rdev::Key::Tab),
        "BACKSPACE" => Some(rdev::Key::Backspace),
        "DELETE" => Some(rdev::Key::Delete),
        "UP" => Some(rdev::Key::UpArrow),
        "DOWN" => Some(rdev::Key::DownArrow),
        "LEFT" => Some(rdev::Key::LeftArrow),
        "RIGHT" => Some(rdev::Key::RightArrow),
        "PAGEUP" => Some(rdev::Key::PageUp),
        "PAGEDOWN" => Some(rdev::Key::PageDown),
        "HOME" => Some(rdev::Key::Home),
        "END" => Some(rdev::Key::End),
        _ => None,
    }
}
