//! How a Columns lays out, decided once here for every platform: the most
//! cells a row holds and the narrowest a cell may get. A renderer puts as many
//! cells in a row as fit at that width (never more than `per`), drops to fewer
//! as the space shrinks, and lets a short last row share its whole width.

use crate::inline::{self, Span};
use crate::tree::{Data, Node};
use alloc::string::String;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Plan {
    /// The most cells in a row, chosen so rows come out even (5 as 3 + 2, 6 as 3 + 3).
    pub per: usize,
    /// The narrowest a cell may get, in CSS pixels (points, dp), before the row drops a column.
    pub min: usize,
}

#[derive(Default)]
struct Weight {
    /// The longest run of text in one block, and all the text, in characters.
    longest: usize,
    total: usize,
    chart: bool,
    /// The most columns any table inside has.
    table_cols: usize,
}

const SMALL: &[&str] = &["Stat", "Badge", "Progress", "Avatar", "Button", "Rating", "Price", "Sparkline", "Gauge", "Countdown", "QR"];
const DRAWN: &[&str] = &["Chart", "Map", "Heatmap", "Funnel", "Calendar", "Carousel", "Video", "Embed"];

fn text_len(spans: &[Span]) -> usize {
    let mut s = String::new();
    inline::plain(spans, &mut s);
    s.chars().count()
}

fn weigh(nodes: &[Node], i: usize, w: &mut Weight) {
    let n = &nodes[i];
    let own = text_len(&n.spans) + if n.component { n.raw.chars().count() } else { 0 };
    w.longest = w.longest.max(own);
    w.total += own;
    if DRAWN.contains(&n.ty.as_str()) {
        w.chart = true;
    }
    if n.ty == "row" {
        w.table_cols = w.table_cols.max(n.children.len());
    }
    if let Some(Data::Table { columns, .. }) = &n.data {
        // A chart's table is drawn, not shown; a wide one still needs the room.
        if n.ty != "Chart" || columns.len() >= 4 {
            w.table_cols = w.table_cols.max(columns.len());
        }
    }
    for &c in &n.children {
        weigh(nodes, c, w);
    }
}

/// The plan for Columns whose items are `items`.
pub fn columns(nodes: &[Node], items: &[usize]) -> Plan {
    let k = items.len().max(1);
    let mut longest = 0;
    let mut total = 0;
    let mut chart = false;
    let mut table_cols = 0;
    for &i in items {
        let mut w = Weight::default();
        weigh(nodes, i, &mut w);
        longest = longest.max(w.longest);
        total = total.max(w.total);
        chart |= w.chart;
        table_cols = table_cols.max(w.table_cols);
    }
    let small = items.iter().all(|&i| !nodes[i].run && SMALL.contains(&nodes[i].ty.as_str()));
    // A tile's own words (a stat's change or note): a sentence there needs a
    // wider tile than a number does, or it runs 14 characters a line.
    let said = items
        .iter()
        .flat_map(|&i| nodes[i].attrs.iter())
        .filter(|(k, _)| matches!(k.as_str(), "change" | "note" | "label" | "subtitle" | "caption"))
        .map(|(_, v)| v.as_deref().unwrap_or("").chars().count())
        .max()
        .unwrap_or(0);
    let (cap, min) = if table_cols >= 4 {
        // A wide table gets the whole row.
        (1, 0)
    } else if small {
        (if k == 5 { 5 } else { 4 }, if said > 28 { 200 } else { 140 })
    } else if chart {
        (2, 280)
    } else if longest >= 90 || total >= 220 {
        // Running text needs a readable line, not 15 characters.
        (2, 260)
    } else {
        (3, 200)
    };
    // As many as the cap allows, with rows as even as the count allows.
    let per = if k <= cap { k } else { k.div_ceil(k.div_ceil(cap)) };
    Plan { per: per.max(1), min }
}
