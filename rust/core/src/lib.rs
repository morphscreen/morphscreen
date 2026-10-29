//! The format's core: one streaming parser, validator and HTML renderer that
//! every platform runs. no_std + alloc, so it builds for WASM, iOS, Android
//! and servers alike.
//!
//! ```text
//! let mut p = Parser::new(Catalog::core());
//! p.push("<Card title=\"Plan\">\nHello ");
//! p.push("world\n</Card>\n");
//! p.finish(false);
//! let ops = p.take_ops();          // JSON lines: open, spans, close, diag, end
//! let html = html::render(&p);     // the finished tree as HTML
//! ```

#![no_std]
extern crate alloc;

pub mod action;
pub mod agui;
pub mod catalog;
mod emoji;
pub mod formula;
pub mod html;
pub mod icon;
pub mod icons;
pub mod images;
pub mod jsnum;
pub mod inline;
pub mod interactive;
pub mod json;
pub mod layout;
pub mod math;
pub mod parse;
pub mod prompt;
pub mod qr;
pub mod sha256;
pub mod text;
pub mod tree;
pub mod validate;

pub use catalog::Catalog;
pub use parse::Parser;
