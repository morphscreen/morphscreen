//! The system prompt, built from the catalog exactly as prompt/prompt.ts
//! builds it (same text, same hash), so the API can build it too.

use crate::catalog::{AttrType, Catalog, Component, Content};
use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;

const RULES: &str = include_str!("../../../prompt/rules.md");
const EXAMPLES: [&str; 2] = [include_str!("../../../prompt/examples/example-1.md"), include_str!("../../../prompt/examples/example-2.md")];

/// `<Slider label! min=number! max=number! step=number />`: one line per component.
pub fn signature(c: &Component) -> String {
    let mut parts: Vec<String> = alloc::vec![c.name.clone()];
    for a in &c.attrs {
        let req = if a.required { "!" } else { "" };
        parts.push(match &a.ty {
            AttrType::Enum(vals) => {
                let mut v: Vec<&str> = Vec::new();
                if let Some(d) = &a.default {
                    v.push(d);
                    v.extend(vals.iter().map(|x| x.as_str()).filter(|x| *x != d));
                } else {
                    v.extend(vals.iter().map(|x| x.as_str()));
                }
                format!("{}={}{}", a.name, v.join("|"), req)
            }
            AttrType::Num => format!("{}=number{}", a.name, req),
            AttrType::Bool => format!("{}=true|false{}", a.name, req),
            AttrType::List => format!("{}=\"A | B\"{}", a.name, req),
            _ => format!("{}{}", a.name, req),
        });
    }
    let open = format!("<{}", parts.join(" "));
    let content = match &c.content {
        Content::None => String::from(" />"),
        Content::Text if c.actions => format!(">label, then Buttons</{}>", c.name),
        Content::Text => format!(">label</{}>", c.name),
        Content::Table => format!(">Markdown table</{}>", c.name),
        Content::Images => format!(">Markdown images</{}>", c.name),
        Content::List => format!(">Markdown list</{}>", c.name),
        Content::Only(t) => format!("><{}>…</{}>", t, c.name),
        // Code reads like any content in the prompt; only the parser treats it differently.
        Content::Any | Content::Code => format!(">…</{}>", c.name),
    };
    let parent = match &c.parent {
        Some(p) => format!(" (only inside {})", p),
        None => String::new(),
    };
    format!("{}{}: {}{}", open, content, c.about, parent)
}

pub fn system_prompt(cat: &Catalog) -> String {
    let components: Vec<String> = cat.components.iter().map(signature).collect();
    let examples: Vec<String> = EXAMPLES.iter().enumerate().map(|(i, e)| format!("Example {}:\n{}", i + 1, e.trim())).collect();
    format!("{}\n\nComponents:\n{}\n\n{}\n", RULES.trim_end(), components.join("\n"), examples.join("\n\n"))
}

pub fn prompt_hash(cat: &Catalog) -> String {
    crate::sha256::hex(system_prompt(cat).as_bytes(), 12)
}
