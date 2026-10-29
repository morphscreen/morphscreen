//! TeX for the Math component: as MathML for the web, where the browser
//! typesets it, and as plain Unicode (Greek letters, operators, fractions,
//! roots, super- and subscripts) for the renderers that show text.

use alloc::string::String;
use alloc::format;
use alloc::vec::Vec;

const SYMBOLS: &[(&str, &str)] = &[
    ("alpha", "α"), ("beta", "β"), ("gamma", "γ"), ("delta", "δ"), ("epsilon", "ε"), ("varepsilon", "ε"), ("zeta", "ζ"), ("eta", "η"),
    ("theta", "θ"), ("vartheta", "ϑ"), ("iota", "ι"), ("kappa", "κ"), ("lambda", "λ"), ("mu", "μ"), ("nu", "ν"), ("xi", "ξ"), ("pi", "π"),
    ("rho", "ρ"), ("sigma", "σ"), ("tau", "τ"), ("upsilon", "υ"), ("phi", "φ"), ("varphi", "φ"), ("chi", "χ"), ("psi", "ψ"), ("omega", "ω"),
    ("Gamma", "Γ"), ("Delta", "Δ"), ("Theta", "Θ"), ("Lambda", "Λ"), ("Xi", "Ξ"), ("Pi", "Π"), ("Sigma", "Σ"), ("Phi", "Φ"), ("Psi", "Ψ"), ("Omega", "Ω"),
    ("times", "×"), ("cdot", "·"), ("div", "÷"), ("pm", "±"), ("mp", "∓"), ("le", "≤"), ("leq", "≤"), ("ge", "≥"), ("geq", "≥"), ("ne", "≠"),
    ("neq", "≠"), ("approx", "≈"), ("equiv", "≡"), ("sim", "∼"), ("propto", "∝"), ("infty", "∞"), ("partial", "∂"), ("nabla", "∇"),
    ("sum", "∑"), ("prod", "∏"), ("int", "∫"), ("iint", "∬"), ("oint", "∮"), ("to", "→"), ("rightarrow", "→"), ("leftarrow", "←"),
    ("Rightarrow", "⇒"), ("Leftarrow", "⇐"), ("Leftrightarrow", "⇔"), ("leftrightarrow", "↔"), ("mapsto", "↦"), ("in", "∈"), ("notin", "∉"),
    ("subset", "⊂"), ("subseteq", "⊆"), ("supset", "⊃"), ("cup", "∪"), ("cap", "∩"), ("forall", "∀"), ("exists", "∃"), ("emptyset", "∅"),
    ("varnothing", "∅"), ("circ", "∘"), ("degree", "°"), ("ldots", "…"), ("cdots", "⋯"), ("dots", "…"), ("hbar", "ℏ"), ("ell", "ℓ"),
    ("angle", "∠"), ("perp", "⊥"), ("parallel", "∥"), ("neg", "¬"), ("land", "∧"), ("lor", "∨"), ("oplus", "⊕"), ("otimes", "⊗"),
    ("langle", "⟨"), ("rangle", "⟩"), ("lfloor", "⌊"), ("rfloor", "⌋"), ("lceil", "⌈"), ("rceil", "⌉"), ("prime", "′"), ("log", "log"),
    ("ln", "ln"), ("sin", "sin"), ("cos", "cos"), ("tan", "tan"), ("exp", "exp"), ("lim", "lim"), ("max", "max"), ("min", "min"), ("det", "det"),
    ("checkmark", "✓"), ("therefore", "∴"), ("because", "∵"), ("implies", "⟹"), ("iff", "⟺"), ("gets", "←"), ("lt", "<"), ("gt", ">"),
    ("ast", "∗"), ("star", "⋆"), ("bullet", "•"), ("triangle", "△"), ("square", "□"), ("dagger", "†"), ("mid", "∣"), ("nmid", "∤"),
    ("cong", "≅"), ("simeq", "≃"), ("ll", "≪"), ("gg", "≫"), ("uparrow", "↑"), ("downarrow", "↓"), ("longrightarrow", "⟶"),
    ("Longrightarrow", "⟹"), ("longleftarrow", "⟵"), ("setminus", "∖"), ("vee", "∨"), ("wedge", "∧"), ("aleph", "ℵ"), ("top", "⊤"),
    ("bot", "⊥"), ("supseteq", "⊇"), ("ni", "∋"), ("nexists", "∄"), ("colon", ":"),
    ("quad", "  "), ("qquad", "    "), ("{", "{"), ("}", "}"), ("%", "%"), ("$", "$"), ("&", "&"), ("_", "_"), ("#", "#"), ("|", "‖"),
];

const BLACKBOARD: &[(char, char)] = &[('R', 'ℝ'), ('N', 'ℕ'), ('Z', 'ℤ'), ('Q', 'ℚ'), ('C', 'ℂ'), ('P', 'ℙ')];

fn script(c: char, sup: bool) -> Option<char> {
    const SUP: &str = "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ";
    const SUB: &str = "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₙᵢ";
    const FROM: &str = "0123456789+-=()ni";
    let k = FROM.chars().position(|x| x == c);
    if let Some(k) = k {
        return (if sup { SUP } else { SUB }).chars().nth(k);
    }
    if sup {
        // Superscript letters Unicode has (no q, C, F, Q, S, X, Y, Z).
        return "abcdefghijklmoprstuvwxyzABDEGHIJKLMNOPRTUVW"
            .chars()
            .zip("ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐᵒᵖʳˢᵗᵘᵛʷˣʸᶻᴬᴮᴰᴱᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿᵀᵁⱽᵂ".chars())
            .find(|(f, _)| *f == c)
            .map(|(_, t)| t);
    }
    // Subscript letters Unicode has.
    "aeohklmpstjrux".chars().zip("ₐₑₒₕₖₗₘₚₛₜⱼᵣᵤₓ".chars()).find(|(f, _)| *f == c).map(|(_, t)| t)
}

struct P<'a> {
    s: &'a [char],
    i: usize,
    depth: usize,
}

impl P<'_> {
    fn peek(&self) -> Option<char> {
        self.s.get(self.i).copied()
    }

    /// One argument: a {group}, a \command, or a single character.
    fn arg(&mut self) -> String {
        while self.peek() == Some(' ') {
            self.i += 1;
        }
        match self.peek() {
            Some('{') => {
                self.i += 1;
                self.until('}')
            }
            // Too deep to work out: the command's name as it was written.
            Some('\\') if self.depth >= DEPTH => {
                let start = self.i;
                self.i += 1;
                while self.peek().is_some_and(|c| c.is_ascii_alphabetic()) {
                    self.i += 1;
                }
                self.s[start..self.i].iter().collect()
            }
            Some('\\') => {
                let mut o = String::new();
                self.depth += 1;
                self.command(&mut o);
                self.depth -= 1;
                o
            }
            Some(c) => {
                self.i += 1;
                String::from(c)
            }
            None => String::new(),
        }
    }

    /// Converts up to the closing `end` (consumed) or the end of input.
    fn until(&mut self, end: char) -> String {
        let mut o = String::new();
        if self.depth >= DEPTH {
            // Too deep to work out: the rest of the group as it was written.
            let mut open = 1usize;
            while let Some(c) = self.peek() {
                self.i += 1;
                if c == '{' && end == '}' {
                    open += 1;
                } else if c == end {
                    open -= 1;
                    if open == 0 {
                        break;
                    }
                }
                o.push(c);
            }
            return o;
        }
        self.depth += 1;
        while let Some(c) = self.peek() {
            if c == end {
                self.i += 1;
                break;
            }
            self.one(&mut o);
        }
        self.depth -= 1;
        o
    }

    fn command(&mut self, o: &mut String) {
        self.i += 1;
        let start = self.i;
        while self.peek().map_or(false, |c| c.is_ascii_alphabetic()) {
            self.i += 1;
        }
        if self.i == start {
            // \, \; \! \{ and friends: one symbol character.
            if let Some(c) = self.peek() {
                self.i += 1;
                match c {
                    ',' | ';' | ':' | ' ' => o.push(' '),
                    '!' => {}
                    _ => o.push_str(SYMBOLS.iter().find(|(k, _)| k.len() == 1 && k.starts_with(c)).map_or("", |(_, v)| v)),
                }
            }
            return;
        }
        let name: String = self.s[start..self.i].iter().collect();
        match name.as_str() {
            "frac" | "dfrac" | "tfrac" => {
                let (a, b) = (self.arg(), self.arg());
                o.push_str(&group(&a));
                o.push('/');
                o.push_str(&group(&b));
            }
            "sqrt" => {
                let mut index = String::new();
                if self.peek() == Some('[') {
                    self.i += 1;
                    index = self.until(']');
                }
                let a = self.arg();
                for c in index.chars() {
                    o.push(script(c, true).unwrap_or(c));
                }
                o.push('√');
                o.push_str(&group(&a));
            }
            "text" | "mathrm" | "mathbf" | "mathit" | "operatorname" | "textbf" | "mathsf" | "mathtt" | "boldsymbol" => {
                let a = self.arg();
                o.push_str(&a);
            }
            "mathbb" => {
                let a = self.arg();
                for c in a.chars() {
                    o.push(BLACKBOARD.iter().find(|(f, _)| *f == c).map_or(c, |(_, t)| *t));
                }
            }
            "bar" | "overline" | "hat" | "vec" | "dot" | "tilde" => {
                let mark = match name.as_str() {
                    "bar" | "overline" => '\u{0304}',
                    "hat" => '\u{0302}',
                    "vec" => '\u{20D7}',
                    "dot" => '\u{0307}',
                    _ => '\u{0303}',
                };
                // The mark goes on each letter, not on marks already there: \hat\hat x would
                // otherwise double with every accent.
                for c in self.arg().chars() {
                    o.push(c);
                    if !matches!(c as u32, 0x0300..=0x036F | 0x20D0..=0x20FF) {
                        o.push(mark);
                    }
                }
            }
            "stackrel" | "overset" | "underset" => {
                let (mark, base) = (self.arg(), self.arg());
                match (mark.trim(), base.trim()) {
                    ("?", "=") => o.push('≟'),
                    ("def", "=") => o.push('≝'),
                    (m, b) => {
                        o.push_str(&group(b));
                        let over = name != "underset";
                        let scripted: Option<String> = m.chars().map(|c| script(c, over)).collect();
                        o.push_str(&scripted.unwrap_or_else(|| alloc::format!("({m})")));
                    }
                }
            }
            "left" | "right" | "big" | "Big" | "bigg" | "Bigg" | "displaystyle" | "limits" => {}
            _ => match SYMBOLS.iter().find(|(k, _)| *k == name) {
                Some((_, v)) => o.push_str(v),
                // A command we don't draw stays readable as TeX (validation asks for it to be rewritten).
                None => {
                    o.push('\\');
                    o.push_str(&name);
                }
            },
        }
    }

    fn one(&mut self, o: &mut String) {
        let c = self.peek().unwrap();
        match c {
            '\\' => self.command(o),
            '^' | '_' => {
                self.i += 1;
                let a = self.arg();
                let mapped: Option<String> = a.chars().map(|x| script(x, c == '^')).collect();
                match mapped {
                    Some(m) => o.push_str(&m),
                    None => {
                        o.push(c);
                        o.push_str(&group(&a));
                    }
                }
            }
            '{' => {
                self.i += 1;
                let inner = self.until('}');
                o.push_str(&inner);
            }
            '}' => self.i += 1,
            '~' => {
                self.i += 1;
                o.push(' ');
            }
            _ => {
                self.i += 1;
                o.push(c);
            }
        }
    }
}

/// Parentheses around anything longer than one term.
fn group(s: &str) -> String {
    let t = s.trim();
    if t.chars().count() <= 1 || t.chars().all(|c| c.is_alphanumeric() || c == '.') {
        String::from(t)
    } else {
        let mut o = String::from("(");
        o.push_str(t);
        o.push(')');
        o
    }
}

/// `\frac{1}{2} m v^2` as "1/2 m v²".
pub fn to_unicode(tex: &str) -> String {
    let chars: Vec<char> = tex.trim().trim_matches('$').chars().collect();
    let mut p = P { s: &chars, i: 0, depth: 0 };
    let mut o = String::new();
    while p.peek().is_some() {
        p.one(&mut o);
    }
    // Collapse runs of spaces.
    let mut out = String::with_capacity(o.len());
    let mut space = false;
    for c in o.trim().chars() {
        if c == ' ' {
            if !space {
                out.push(c);
            }
            space = true;
        } else {
            out.push(c);
            space = false;
        }
    }
    out
}

// ---------- MathML, for the web ----------
//
// Browsers lay out MathML themselves (fractions stacked, roots drawn, scripts
// raised), so the web shows a formula as it is typeset; the other renderers
// keep the Unicode line above. Malformed TeX still gives valid markup, and
// nesting past a fixed depth reads on as text, so no input can exhaust the stack.

const DEPTH: usize = 24;
/// Operators drawn with their limits above and below in a displayed formula.
const UNDER: &[&str] = &["sum", "prod", "coprod", "bigcup", "bigcap", "lim", "liminf", "limsup", "max", "min", "sup", "inf", "argmax", "argmin"];
/// Names set upright, as functions.
const FUNCS: &[&str] = &[
    "log", "ln", "lg", "sin", "cos", "tan", "sec", "csc", "cot", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "exp", "lim", "liminf", "limsup", "max",
    "min", "sup", "inf", "det", "dim", "ker", "deg", "gcd", "arg", "Pr", "argmax", "argmin", "mod",
];
/// Symbols that are quantities rather than operators.
const ORDINARY: &str = "∞∂∇ℏℓ∅°′αβγδεζηθϑικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ";

fn esc_ml(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => o.push_str("&amp;"),
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '"' => o.push_str("&quot;"),
            _ => o.push(c),
        }
    }
    o
}

fn tag(name: &str, inner: &str) -> String {
    let mut o = String::with_capacity(inner.len() + 2 * name.len() + 5);
    o.push('<');
    o.push_str(name);
    o.push('>');
    o.push_str(inner);
    o.push_str("</");
    o.push_str(name.split(' ').next().unwrap_or(name));
    o.push('>');
    o
}

/// A run of nodes as one: itself when it is a single node, else an mrow.
fn row_of(nodes: &[String]) -> String {
    match nodes.len() {
        1 => nodes[0].clone(),
        _ => tag("mrow", &nodes.concat()),
    }
}

struct M<'a> {
    s: &'a [char],
    i: usize,
    depth: usize,
    /// Commands it met and doesn't draw, for validation.
    unknown: Vec<String>,
}

impl M<'_> {
    fn peek(&self) -> Option<char> {
        self.s.get(self.i).copied()
    }

    fn spaces(&mut self) {
        while matches!(self.peek(), Some(' ' | '\n' | '\t' | '\r')) {
            self.i += 1;
        }
    }

    /// The command name after a backslash at `self.i` (not consumed).
    fn name_at(&self, at: usize) -> String {
        let mut j = at + 1;
        while self.s.get(j).map_or(false, |c| c.is_ascii_alphabetic()) {
            j += 1;
        }
        self.s.get(at + 1..j).map_or(String::new(), |x| x.iter().collect())
    }

    /// Nodes up to `end` (consumed), a `\right` (left for the caller), or the end of input.
    fn row(&mut self, end: Option<char>) -> Vec<String> {
        let mut out = Vec::new();
        loop {
            self.spaces();
            match self.peek() {
                None => break,
                Some(c) if Some(c) == end => {
                    self.i += 1;
                    break;
                }
                Some('}') => self.i += 1,
                Some('\\') if self.name_at(self.i) == "right" => break,
                Some('&') => {
                    self.i += 1;
                    out.push(String::from("<mspace width=\"1em\"></mspace>"));
                }
                _ => {
                    let node = self.term();
                    out.push(node);
                }
            }
        }
        out
    }

    /// One atom and its scripts.
    fn term(&mut self) -> String {
        let (base, under) = self.atom();
        let (mut sub, mut sup) = (None::<String>, None::<String>);
        loop {
            self.spaces();
            match self.peek() {
                Some('_') if sub.is_none() => {
                    self.i += 1;
                    sub = Some(self.arg());
                }
                Some('^') if sup.is_none() => {
                    self.i += 1;
                    sup = Some(self.arg());
                }
                Some('\'') if sup.is_none() => {
                    let mut p = String::new();
                    while self.peek() == Some('\'') {
                        self.i += 1;
                        p.push('′');
                    }
                    sup = Some(tag("mo", &p));
                }
                _ => break,
            }
        }
        match (sub, sup, under) {
            (None, None, _) => base,
            (Some(b), None, true) => tag("munder", &[base, b].concat()),
            (None, Some(p), true) => tag("mover", &[base, p].concat()),
            (Some(b), Some(p), true) => tag("munderover", &[base, b, p].concat()),
            (Some(b), None, false) => tag("msub", &[base, b].concat()),
            (None, Some(p), false) => tag("msup", &[base, p].concat()),
            (Some(b), Some(p), false) => tag("msubsup", &[base, b, p].concat()),
        }
    }

    /// One argument as a single node: a {group}, a command, or one character.
    fn arg(&mut self) -> String {
        self.spaces();
        match self.peek() {
            None => String::from("<mrow></mrow>"),
            Some('{') => {
                self.i += 1;
                self.group('}')
            }
            // Too deep to lay out (\sqrt\sqrt\sqrt...): the next command or character as text.
            Some(c) if self.depth >= DEPTH => {
                let start = self.i;
                self.i += 1;
                if c == '\\' {
                    while self.peek().is_some_and(|c| c.is_ascii_alphabetic()) {
                        self.i += 1;
                    }
                }
                tag("mtext", &esc_ml(&self.s[start..self.i].iter().collect::<String>()))
            }
            _ => {
                self.depth += 1;
                let a = self.atom().0;
                self.depth -= 1;
                a
            }
        }
    }

    /// A braced group up to `end`, as one node.
    fn group(&mut self, end: char) -> String {
        if self.depth >= DEPTH {
            // Too deep to lay out: the rest of the group as plain text.
            let mut t = String::new();
            let mut open = 1usize;
            while let Some(c) = self.peek() {
                self.i += 1;
                if c == '{' {
                    open += 1;
                } else if c == end {
                    open -= 1;
                    if open == 0 {
                        break;
                    }
                }
                t.push(c);
            }
            return tag("mtext", &esc_ml(&t));
        }
        self.depth += 1;
        let nodes = self.row(Some(end));
        self.depth -= 1;
        tag("mrow", &nodes.concat())
    }

    /// Raw text up to the closing brace of a {group} (for \text).
    fn raw(&mut self) -> String {
        self.spaces();
        if self.peek() != Some('{') {
            return self.peek().map(|c| {
                self.i += 1;
                String::from(c)
            }).unwrap_or_default();
        }
        self.i += 1;
        let mut t = String::new();
        let mut open = 1usize;
        while let Some(c) = self.peek() {
            self.i += 1;
            if c == '{' {
                open += 1;
            } else if c == '}' {
                open -= 1;
                if open == 0 {
                    break;
                }
            }
            t.push(c);
        }
        t
    }

    /// An atom, and whether its scripts go above and below it.
    fn atom(&mut self) -> (String, bool) {
        let Some(c) = self.peek() else { return (String::from("<mrow></mrow>"), false) };
        if c.is_ascii_digit() || (c == '.' && self.s.get(self.i + 1).map_or(false, |d| d.is_ascii_digit())) {
            let mut n = String::new();
            while let Some(d) = self.peek().filter(|d| d.is_ascii_digit() || *d == '.' || *d == ',' && self.s.get(self.i + 1).map_or(false, |e| e.is_ascii_digit())) {
                n.push(d);
                self.i += 1;
            }
            return (tag("mn", &n), false);
        }
        self.i += 1;
        match c {
            '{' => (self.group('}'), false),
            '\\' => {
                self.i -= 1;
                self.command()
            }
            '-' => (tag("mo", "\u{2212}"), false),
            '*' => (tag("mo", "\u{2217}"), false),
            '~' => (String::from("<mspace width=\"0.28em\"></mspace>"), false),
            // Plain brackets keep their size, as TeX's do; only \left and \right ones stretch.
            '(' | ')' | '[' | ']' | '|' => (tag("mo stretchy=\"false\"", &String::from(c)), false),
            _ if c.is_alphabetic() && !ORDINARY.contains(c) => (tag("mi", &esc_ml(&String::from(c))), false),
            _ if ORDINARY.contains(c) => (tag("mi", &esc_ml(&String::from(c))), false),
            _ => (tag("mo", &esc_ml(&String::from(c))), false),
        }
    }

    /// A backslash command at `self.i`.
    fn command(&mut self) -> (String, bool) {
        let name = self.name_at(self.i);
        self.i += 1 + name.chars().count();
        if name.is_empty() {
            // \, \; \: \! \{ \} \| \% and friends: one character.
            let Some(c) = self.peek() else { return (String::new(), false) };
            self.i += 1;
            return match c {
                ',' => (String::from("<mspace width=\"0.17em\"></mspace>"), false),
                ':' | '>' => (String::from("<mspace width=\"0.22em\"></mspace>"), false),
                ';' => (String::from("<mspace width=\"0.28em\"></mspace>"), false),
                ' ' => (String::from("<mspace width=\"0.33em\"></mspace>"), false),
                '!' | '\\' => (String::new(), false),
                '|' => (tag("mo", "\u{2016}"), false),
                _ => (tag("mo", &esc_ml(&String::from(c))), false),
            };
        }
        let n = name.as_str();
        match n {
            "frac" | "dfrac" | "tfrac" | "cfrac" => {
                let (a, b) = (self.arg(), self.arg());
                (tag("mfrac", &[a, b].concat()), false)
            }
            "binom" | "dbinom" | "tbinom" => {
                let (a, b) = (self.arg(), self.arg());
                (tag("mrow", &[tag("mo", "("), tag("mfrac linethickness=\"0\"", &[a, b].concat()), tag("mo", ")")].concat()), false)
            }
            "sqrt" => {
                self.spaces();
                if self.peek() == Some('[') {
                    self.i += 1;
                    let index = if self.depth >= DEPTH { tag("mtext", "") } else {
                        self.depth += 1;
                        let k = self.row(Some(']'));
                        self.depth -= 1;
                        row_of(&k)
                    };
                    let a = self.arg();
                    (tag("mroot", &[a, index].concat()), false)
                } else {
                    let a = self.arg();
                    (tag("msqrt", &a), false)
                }
            }
            "text" | "textrm" | "mbox" | "textit" | "textbf" | "textsf" | "texttt" => (tag("mtext", &esc_ml(&self.raw())), false),
            "operatorname" | "mathrm" => {
                let t = self.raw();
                let t: String = t.chars().filter(|c| !matches!(c, '{' | '}' | '\\')).collect();
                (format!("<mi mathvariant=\"normal\">{}</mi>", esc_ml(t.trim())), false)
            }
            "mathbf" | "boldsymbol" | "bm" => {
                let a = self.arg();
                (format!("<mrow style=\"font-weight:700\">{a}</mrow>"), false)
            }
            "mathit" | "mathsf" | "mathtt" | "mathcal" => (self.arg(), false),
            "mathbb" => {
                let t = self.raw();
                let t: String = t.chars().map(|c| BLACKBOARD.iter().find(|(f, _)| *f == c).map_or(c, |(_, d)| *d)).collect();
                (tag("mi", &esc_ml(&t)), false)
            }
            "hat" | "widehat" | "bar" | "overline" | "vec" | "dot" | "ddot" | "tilde" | "widetilde" => {
                let mark = match n {
                    "hat" | "widehat" => "^",
                    "bar" | "overline" => "\u{203E}",
                    "vec" => "\u{2192}",
                    "dot" => "\u{02D9}",
                    "ddot" => "\u{00A8}",
                    _ => "~",
                };
                let a = self.arg();
                (tag("mover accent=\"true\"", &[a, tag("mo", mark)].concat()), false)
            }
            "underline" => {
                let a = self.arg();
                (tag("munder accentunder=\"true\"", &[a, tag("mo", "_")].concat()), false)
            }
            "left" => {
                let open = self.delimiter();
                let inner = if self.depth >= DEPTH { Vec::new() } else {
                    self.depth += 1;
                    let r = self.row(None);
                    self.depth -= 1;
                    r
                };
                let close = if self.name_at(self.i) == "right" {
                    self.i += 1 + "right".len();
                    self.delimiter()
                } else {
                    String::new()
                };
                let fence = |d: &str| if d.is_empty() { String::new() } else { tag("mo fence=\"true\" stretchy=\"true\"", &esc_ml(d)) };
                (tag("mrow", &[fence(&open), inner.concat(), fence(&close)].concat()), false)
            }
            "right" => {
                self.delimiter();
                (String::new(), false)
            }
            "big" | "Big" | "bigg" | "Bigg" | "bigl" | "bigr" | "Bigl" | "Bigr" | "displaystyle" | "textstyle" | "limits" | "nolimits" | "middle" => (String::new(), false),
            "quad" => (String::from("<mspace width=\"1em\"></mspace>"), false),
            "qquad" => (String::from("<mspace width=\"2em\"></mspace>"), false),
            // A mark over or under a symbol: \stackrel{?}{=}, \overset{def}{=}, \underset{x \to 0}{\lim}.
            "stackrel" | "overset" | "underset" => {
                let (mark, base) = (self.arg(), self.arg());
                (tag(if n == "underset" { "munder" } else { "mover" }, &[base, mark].concat()), false)
            }
            _ if FUNCS.contains(&n) => (tag("mi", n), UNDER.contains(&n)),
            _ => match SYMBOLS.iter().find(|(k, _)| *k == n) {
                Some((_, v)) => {
                    let under = UNDER.contains(&n);
                    let ordinary = v.chars().count() == 1 && v.chars().all(|c| ORDINARY.contains(c));
                    let upright = v.chars().all(|c| ('\u{0391}'..='\u{03A9}').contains(&c));
                    if upright {
                        (format!("<mi mathvariant=\"normal\">{v}</mi>"), false)
                    } else if ordinary {
                        (tag("mi", v), false)
                    } else if n == "int" || n == "iint" || n == "oint" {
                        (tag("mo", v), false)
                    } else {
                        (tag("mo", &esc_ml(v)), under)
                    }
                }
                // Drawn as the TeX it is, and noted: validation asks for it to be rewritten.
                None => {
                    self.unknown.push(String::from(n));
                    (tag("mtext", &esc_ml(&format!("\\{n}"))), false)
                }
            },
        }
    }

    /// The delimiter after \left or \right: a character, a command, or "." for none.
    fn delimiter(&mut self) -> String {
        self.spaces();
        match self.peek() {
            Some('.') => {
                self.i += 1;
                String::new()
            }
            Some('\\') => {
                let name = self.name_at(self.i);
                if name.is_empty() {
                    self.i += 1;
                    let c = self.peek().map(|c| {
                        self.i += 1;
                        c
                    });
                    return match c {
                        Some('|') => String::from("\u{2016}"),
                        Some(c) => String::from(c),
                        None => String::new(),
                    };
                }
                self.i += 1 + name.len();
                SYMBOLS.iter().find(|(k, _)| *k == name).map_or(String::new(), |(_, v)| String::from(*v))
            }
            Some(c) => {
                self.i += 1;
                String::from(c)
            }
            None => String::new(),
        }
    }
}

/// The commands in `tex` that aren't drawn, each once: what a model has to
/// rewrite (`\stackrel` is drawn, `\cancel` isn't).
pub fn unsupported(tex: &str) -> Vec<String> {
    let chars: Vec<char> = tex.trim().trim_matches('$').chars().collect();
    let mut m = M { s: &chars, i: 0, depth: 0, unknown: Vec::new() };
    loop {
        m.row(None);
        if m.peek().is_none() {
            break;
        }
        m.i += 1 + "right".len();
        m.delimiter();
    }
    let mut out: Vec<String> = Vec::new();
    for n in m.unknown {
        if !out.contains(&n) {
            out.push(n);
        }
    }
    out
}

/// `\frac{1}{2} m v^2` as a displayed MathML formula.
pub fn to_mathml(tex: &str) -> String {
    let chars: Vec<char> = tex.trim().trim_matches('$').chars().collect();
    let mut m = M { s: &chars, i: 0, depth: 0, unknown: Vec::new() };
    let mut nodes = Vec::new();
    // A stray \right at the top level is skipped rather than ending the formula.
    loop {
        nodes.extend(m.row(None));
        if m.peek().is_none() {
            break;
        }
        m.i += 1 + "right".len();
        m.delimiter();
    }
    format!("<math display=\"block\">{}</math>", row_of(&nodes))
}
