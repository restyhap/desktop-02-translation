use std::collections::HashSet;
use std::env;
use std::io::{self, Write};
use std::time::{Duration, Instant};

const SEQ_WINDOW: Duration = Duration::from_millis(500);

struct Rule {
    tag: String,
    required_modifiers: Vec<rdev::Key>,
    key_sequence: Vec<rdev::Key>,
    match_index: usize,
    last_press: Instant,
}

fn modifier_held(
    modifiers: &[bool; 4],
    modifier: &rdev::Key,
) -> bool {
    // [ctrl, meta, shift, alt]
    match modifier {
        rdev::Key::ControlLeft | rdev::Key::ControlRight => modifiers[0],
        rdev::Key::MetaLeft | rdev::Key::MetaRight => modifiers[1],
        rdev::Key::ShiftLeft | rdev::Key::ShiftRight => modifiers[2],
        rdev::Key::Alt | rdev::Key::AltGr => modifiers[3],
        _ => false,
    }
}

fn all_required_held(rule: &Rule, modifiers: &[bool; 4]) -> bool {
    rule.required_modifiers
        .iter()
        .all(|m| modifier_held(modifiers, m))
}

fn is_modifier_key(key: &rdev::Key) -> bool {
    matches!(
        key,
        rdev::Key::ControlLeft
            | rdev::Key::ControlRight
            | rdev::Key::MetaLeft
            | rdev::Key::MetaRight
            | rdev::Key::ShiftLeft
            | rdev::Key::ShiftRight
            | rdev::Key::Alt
            | rdev::Key::AltGr
    )
}

fn parse_arg(arg: &str, default_tag: &str) -> (String, Vec<rdev::Key>, Vec<rdev::Key>) {
    let (tag, spec) = match arg.find('=') {
        Some(pos) => (&arg[..pos], &arg[pos + 1..]),
        None => (default_tag, arg),
    };

    let (mod_part, key_part) = match spec.find(':') {
        Some(pos) => (&spec[..pos], &spec[pos + 1..]),
        None => ("", spec),
    };

    let required_modifiers: Vec<rdev::Key> = mod_part
        .split(',')
        .filter(|s| !s.is_empty())
        .filter_map(|s| match s.trim().to_lowercase().as_str() {
            "ctrl" | "control" => Some(vec![rdev::Key::ControlLeft]),
            "meta" | "command" => Some(vec![rdev::Key::MetaLeft]),
            "shift" => Some(vec![rdev::Key::ShiftLeft]),
            "alt" => Some(vec![rdev::Key::Alt]),
            _ => None,
        })
        .flatten()
        .collect();

    let key_sequence: Vec<rdev::Key> = key_part
        .split(',')
        .filter(|s| !s.is_empty())
        .filter_map(|s| parse_key(s.trim()))
        .collect();

    (tag.to_string(), required_modifiers, key_sequence)
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let specs: Vec<String> = if args.len() > 1 {
        args[1..].to_vec()
    } else {
        vec!["meta:C".to_string()]
    };

    let mut rules: Vec<Rule> = Vec::new();
    for (i, spec) in specs.iter().enumerate() {
        let (tag, required_modifiers, key_sequence) = parse_arg(spec, &format!("RULE{}", i));
        if key_sequence.is_empty() {
            eprintln!("[hook] 无效的按键序列: {}", spec);
            continue;
        }
        rules.push(Rule {
            tag,
            required_modifiers,
            key_sequence,
            match_index: 0,
            last_press: Instant::now() - SEQ_WINDOW,
        });
    }

    if rules.is_empty() {
        eprintln!("[hook] 没有有效的按键规则");
        std::process::exit(1);
    }

    // [ctrl, meta, shift, alt]
    let mut modifiers = [false; 4];
    let mut pressed_keys: HashSet<rdev::Key> = HashSet::new();
    let mut last_mouse_pos: Option<(f64, f64)> = None;

    let mut stdout = io::stdout();

    // 启动时静默，不向 stderr 输出日志（避免被误当作翻译文本）
    // eprintln!(
    //     "[hook] keyboard-hook started, rules={:?}",
    //     rules
    //         .iter()
    //         .map(|r| format!("{}:{:?}", r.tag, r.key_sequence))
    //         .collect::<Vec<_>>()
    // );

    if let Err(e) = rdev::listen(move |event| match event.event_type {
        rdev::EventType::KeyPress(key) => {
            if is_modifier_key(&key) {
                match key {
                    rdev::Key::ControlLeft | rdev::Key::ControlRight => modifiers[0] = true,
                    rdev::Key::MetaLeft | rdev::Key::MetaRight => modifiers[1] = true,
                    rdev::Key::ShiftLeft | rdev::Key::ShiftRight => modifiers[2] = true,
                    rdev::Key::Alt | rdev::Key::AltGr => modifiers[3] = true,
                    _ => {}
                }
                return;
            }

            if pressed_keys.contains(&key) {
                return;
            }
            pressed_keys.insert(key);

            let now = Instant::now();

            for rule in rules.iter_mut() {
                if !all_required_held(rule, &modifiers) {
                    rule.match_index = 0;
                    continue;
                }

                if rule.match_index >= 1 {
                    let gap = now.duration_since(rule.last_press);
                    if gap > SEQ_WINDOW {
                        rule.match_index = 0;
                    }
                }

                let expected = &rule.key_sequence[rule.match_index];

                if key == *expected {
                    rule.last_press = now;
                    rule.match_index += 1;

                    if rule.match_index >= rule.key_sequence.len() {
                        rule.match_index = 0;
                        eprintln!("[hook] >>> SENDING {}", rule.tag);
                        let (x, y) = last_mouse_pos.unwrap_or((0.0, 0.0));
                        let _ = writeln!(stdout, "{} {} {}", rule.tag, x, y);
                        let _ = stdout.flush();
                    }
                } else {
                    rule.match_index = 0;
                }
            }
        }
        rdev::EventType::KeyRelease(key) => {
            if is_modifier_key(&key) {
                match key {
                    rdev::Key::ControlLeft | rdev::Key::ControlRight => modifiers[0] = false,
                    rdev::Key::MetaLeft | rdev::Key::MetaRight => modifiers[1] = false,
                    rdev::Key::ShiftLeft | rdev::Key::ShiftRight => modifiers[2] = false,
                    rdev::Key::Alt | rdev::Key::AltGr => modifiers[3] = false,
                    _ => {}
                }
            } else {
                pressed_keys.remove(&key);
            }
        }
        rdev::EventType::MouseMove { x, y } => {
            last_mouse_pos = Some((x, y));
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