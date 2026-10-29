//! QR codes for the QR component: byte mode, error correction level M,
//! versions 1 to 10 (up to 213 bytes: links, Wi-Fi joins, short text). The
//! module rows go to every renderer, so none needs its own encoder.

use alloc::vec;
use alloc::vec::Vec;

/// Per version, level M: (EC codewords per block, [(blocks, data codewords)]).
const BLOCKS: [(usize, [(usize, usize); 2]); 10] = [
    (10, [(1, 16), (0, 0)]),
    (16, [(1, 28), (0, 0)]),
    (26, [(1, 44), (0, 0)]),
    (18, [(2, 32), (0, 0)]),
    (24, [(2, 43), (0, 0)]),
    (16, [(4, 27), (0, 0)]),
    (18, [(4, 31), (0, 0)]),
    (22, [(2, 38), (2, 39)]),
    (22, [(3, 36), (2, 37)]),
    (26, [(4, 43), (1, 44)]),
];

const ALIGN: [&[usize]; 10] = [&[], &[6, 18], &[6, 22], &[6, 26], &[6, 30], &[6, 34], &[6, 22, 38], &[6, 24, 42], &[6, 26, 46], &[6, 28, 50]];

fn data_capacity(v: usize) -> usize {
    BLOCKS[v - 1].1.iter().map(|(n, d)| n * d).sum()
}

struct Bits(Vec<bool>);

impl Bits {
    fn push(&mut self, val: u32, len: usize) {
        for i in (0..len).rev() {
            self.0.push((val >> i) & 1 == 1);
        }
    }
}

fn gf_mul(mut a: u8, mut b: u8) -> u8 {
    let mut r = 0u8;
    while b != 0 {
        if b & 1 != 0 {
            r ^= a;
        }
        let hi = a & 0x80 != 0;
        a <<= 1;
        if hi {
            a ^= 0x1D;
        }
        b >>= 1;
    }
    r
}

/// Reed-Solomon error correction codewords for one block.
fn ecc(data: &[u8], n: usize) -> Vec<u8> {
    // Generator polynomial (x - a^0)(x - a^1)...(x - a^(n-1)), leading 1 dropped.
    let mut gen = vec![0u8; n];
    gen[n - 1] = 1;
    let mut root = 1u8;
    for _ in 0..n {
        for j in 0..n {
            gen[j] = gf_mul(gen[j], root);
            if j + 1 < n {
                gen[j] ^= gen[j + 1];
            }
        }
        root = gf_mul(root, 2);
    }
    let mut rem = vec![0u8; n];
    for &b in data {
        let f = b ^ rem[0];
        rem.remove(0);
        rem.push(0);
        for j in 0..n {
            rem[j] ^= gf_mul(gen[j], f);
        }
    }
    rem
}

struct Grid {
    size: usize,
    dark: Vec<bool>,
    fixed: Vec<bool>,
}

impl Grid {
    fn set(&mut self, x: usize, y: usize, d: bool) {
        self.dark[y * self.size + x] = d;
        self.fixed[y * self.size + x] = true;
    }
    fn get(&self, x: usize, y: usize) -> bool {
        self.dark[y * self.size + x]
    }
}

fn finder(g: &mut Grid, cx: isize, cy: isize) {
    for dy in -4..=4isize {
        for dx in -4..=4isize {
            let (x, y) = (cx + dx, cy + dy);
            if x < 0 || y < 0 || x >= g.size as isize || y >= g.size as isize {
                continue;
            }
            let d = dx.abs().max(dy.abs());
            g.set(x as usize, y as usize, d != 2 && d != 4);
        }
    }
}

fn format_bits(mask: usize) -> u32 {
    // Level M is 00.
    let data = mask as u32;
    let mut rem = data;
    for _ in 0..10 {
        rem = (rem << 1) ^ ((rem >> 9) * 0x537);
    }
    ((data << 10) | rem) ^ 0x5412
}

fn draw_format(g: &mut Grid, mask: usize) {
    let bits = format_bits(mask);
    let bit = |i: usize| (bits >> i) & 1 == 1;
    let s = g.size;
    for i in 0..=5 {
        g.set(8, i, bit(i));
    }
    g.set(8, 7, bit(6));
    g.set(8, 8, bit(7));
    g.set(7, 8, bit(8));
    for i in 9..15 {
        g.set(14 - i, 8, bit(i));
    }
    for i in 0..8 {
        g.set(s - 1 - i, 8, bit(i));
    }
    for i in 8..15 {
        g.set(8, s - 15 + i, bit(i));
    }
    g.set(8, s - 8, true);
}

fn draw_version(g: &mut Grid, v: usize) {
    if v < 7 {
        return;
    }
    let mut rem = v as u32;
    for _ in 0..12 {
        rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
    }
    let bits = ((v as u32) << 12) | rem;
    for i in 0..18 {
        let d = (bits >> i) & 1 == 1;
        let (a, b) = (g.size - 11 + i % 3, i / 3);
        g.set(a, b, d);
        g.set(b, a, d);
    }
}

fn masked(mask: usize, x: usize, y: usize) -> bool {
    match mask {
        0 => (x + y) % 2 == 0,
        1 => y % 2 == 0,
        2 => x % 3 == 0,
        3 => (x + y) % 3 == 0,
        4 => (x / 3 + y / 2) % 2 == 0,
        5 => x * y % 2 + x * y % 3 == 0,
        6 => (x * y % 2 + x * y % 3) % 2 == 0,
        _ => ((x + y) % 2 + x * y % 3) % 2 == 0,
    }
}

fn penalty(g: &Grid) -> usize {
    let s = g.size;
    let mut p = 0;
    // Runs of five or more in a row or column, and finder-like patterns.
    for horizontal in [true, false] {
        for a in 0..s {
            let at = |b: usize| if horizontal { g.get(b, a) } else { g.get(a, b) };
            let mut run = 1;
            for b in 1..=s {
                if b < s && at(b) == at(b - 1) {
                    run += 1;
                } else {
                    if run >= 5 {
                        p += run - 2;
                    }
                    run = 1;
                }
            }
            for b in 0..s.saturating_sub(10) {
                let pat: [bool; 11] = core::array::from_fn(|k| at(b + k));
                const A: [bool; 11] = [true, false, true, true, true, false, true, false, false, false, false];
                const B: [bool; 11] = [false, false, false, false, true, false, true, true, true, false, true];
                if pat == A || pat == B {
                    p += 40;
                }
            }
        }
    }
    for y in 0..s - 1 {
        for x in 0..s - 1 {
            let c = g.get(x, y);
            if c == g.get(x + 1, y) && c == g.get(x, y + 1) && c == g.get(x + 1, y + 1) {
                p += 3;
            }
        }
    }
    let dark = g.dark.iter().filter(|&&d| d).count();
    let total = s * s;
    let k = (dark * 20).abs_diff(total * 10).div_ceil(total).saturating_sub(1);
    p + k * 10
}

/// The QR code for `text` as rows of '1' (dark) and '0', or None when it's
/// longer than 213 bytes.
pub fn encode(text: &str) -> Option<Vec<alloc::string::String>> {
    let bytes = text.as_bytes();
    let v = (1..=10).find(|&v| {
        let count_bits = if v < 10 { 8 } else { 16 };
        4 + count_bits + bytes.len() * 8 <= data_capacity(v) * 8
    })?;
    let cap = data_capacity(v);
    let mut bits = Bits(Vec::new());
    bits.push(0b0100, 4);
    bits.push(bytes.len() as u32, if v < 10 { 8 } else { 16 });
    for &b in bytes {
        bits.push(b as u32, 8);
    }
    let room = cap * 8 - bits.0.len();
    bits.push(0, room.min(4));
    while bits.0.len() % 8 != 0 {
        bits.0.push(false);
    }
    let mut data: Vec<u8> = bits.0.chunks(8).map(|c| c.iter().fold(0u8, |a, &b| (a << 1) | b as u8)).collect();
    let mut pad = [0xECu8, 0x11].into_iter().cycle();
    while data.len() < cap {
        data.push(pad.next().unwrap());
    }
    // Split into blocks, add error correction, interleave.
    let (ec, groups) = BLOCKS[v - 1];
    let mut blocks: Vec<(Vec<u8>, Vec<u8>)> = Vec::new();
    let mut at = 0;
    for &(n, d) in groups.iter() {
        for _ in 0..n {
            let chunk = data[at..at + d].to_vec();
            at += d;
            let e = ecc(&chunk, ec);
            blocks.push((chunk, e));
        }
    }
    let mut words = Vec::new();
    let longest = blocks.iter().map(|b| b.0.len()).max().unwrap_or(0);
    for i in 0..longest {
        for b in &blocks {
            if i < b.0.len() {
                words.push(b.0[i]);
            }
        }
    }
    for i in 0..ec {
        for b in &blocks {
            words.push(b.1[i]);
        }
    }

    let size = 17 + 4 * v;
    let mut g = Grid { size, dark: vec![false; size * size], fixed: vec![false; size * size] };
    for i in 0..size {
        g.set(6, i, i % 2 == 0);
        g.set(i, 6, i % 2 == 0);
    }
    finder(&mut g, 3, 3);
    finder(&mut g, size as isize - 4, 3);
    finder(&mut g, 3, size as isize - 4);
    let al = ALIGN[v - 1];
    for &ay in al {
        for &ax in al {
            let corner = (ax == 6 && ay == 6) || (ax == 6 && ay == al[al.len() - 1]) || (ay == 6 && ax == al[al.len() - 1]);
            if corner {
                continue;
            }
            for dy in -2..=2isize {
                for dx in -2..=2isize {
                    let d = dx.abs().max(dy.abs());
                    g.set((ax as isize + dx) as usize, (ay as isize + dy) as usize, d != 1);
                }
            }
        }
    }
    draw_format(&mut g, 0);
    draw_version(&mut g, v);

    // Data bits in the zigzag, right to left in column pairs, skipping the timing column.
    let mut i = 0;
    let total_bits = words.len() * 8;
    let mut right = size as isize - 1;
    while right >= 1 {
        if right == 6 {
            right = 5;
        }
        for vert in 0..size {
            for j in 0..2 {
                let x = (right - j) as usize;
                let upward = ((right + 1) & 2) == 0;
                let y = if upward { size - 1 - vert } else { vert };
                if !g.fixed[y * size + x] && i < total_bits {
                    g.dark[y * size + x] = (words[i >> 3] >> (7 - (i & 7))) & 1 == 1;
                    i += 1;
                }
            }
        }
        right -= 2;
    }

    // The mask with the lowest penalty.
    let base = g.dark.clone();
    let mut best = (usize::MAX, 0);
    for m in 0..8 {
        g.dark = base.clone();
        apply_mask(&mut g, m);
        draw_format(&mut g, m);
        let p = penalty(&g);
        if p < best.0 {
            best = (p, m);
        }
    }
    g.dark = base;
    apply_mask(&mut g, best.1);
    draw_format(&mut g, best.1);
    Some((0..size).map(|y| (0..size).map(|x| if g.get(x, y) { '1' } else { '0' }).collect()).collect())
}

fn apply_mask(g: &mut Grid, m: usize) {
    for y in 0..g.size {
        for x in 0..g.size {
            if !g.fixed[y * g.size + x] && masked(m, x, y) {
                g.dark[y * g.size + x] ^= true;
            }
        }
    }
}
