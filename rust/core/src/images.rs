//! Where pictures may load from, the same rule as every SDK's (docs/media.md):
//! a data: image, or https (http on this machine) from one of the app's hosts. An answer's image URLs are the model's; loading
//! one tells its host who is reading, and a URL can carry what the page holds
//! out to anyone. With no hosts set, only data: images load.

use alloc::string::String;
use alloc::vec::Vec;

#[derive(Clone, Debug, Default)]
pub struct ImagePolicy {
    hosts: Vec<String>,
}

impl ImagePolicy {
    /// The app's own hosts ("cdn.example.com", or full URLs).
    pub fn new(hosts: &[&str]) -> ImagePolicy {
        let hosts = hosts.iter().copied().map(host_of).filter(|h| !h.is_empty()).collect();
        ImagePolicy { hosts }
    }

    /// Whether `src` may load.
    pub fn allows(&self, src: &str) -> bool {
        let s = src.trim();
        if starts_with_ci(s, "data:image/") {
            return true;
        }
        let local = |h: &str| {
            let name = h.rsplit_once(':').filter(|(n, p)| !n.is_empty() && p.bytes().all(|b| b.is_ascii_digit())).map_or(h, |(n, _)| n);
            matches!(name, "localhost" | "127.0.0.1" | "[::1]")
        };
        let host = if starts_with_ci(s, "https://") {
            host_of(s)
        } else if starts_with_ci(s, "http://") {
            let h = host_of(s);
            if !local(&h) {
                return false;
            }
            h
        } else {
            return false;
        };
        !host.is_empty() && self.hosts.iter().any(|h| *h == host)
    }
}

fn starts_with_ci(s: &str, prefix: &str) -> bool {
    s.len() >= prefix.len() && s.as_bytes()[..prefix.len()].eq_ignore_ascii_case(prefix.as_bytes())
}

/// A URL's host as the browser's URL.host has it (lower case, with a port
/// other than the scheme's own), or a bare host as written.
fn host_of(u: &str) -> String {
    let u = u.trim();
    let (scheme, rest) = match u.find("://") {
        Some(i) => (u[..i].to_ascii_lowercase(), &u[i + 3..]),
        None => (String::new(), u),
    };
    let auth = rest.split(['/', '?', '#']).next().unwrap_or("");
    let auth = auth.rsplit_once('@').map_or(auth, |(_, h)| h);
    let mut h = auth.to_ascii_lowercase();
    let default = match scheme.as_str() {
        "https" => ":443",
        "http" => ":80",
        _ => "",
    };
    if !default.is_empty() && h.ends_with(default) {
        h.truncate(h.len() - default.len());
    }
    h
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_listed_hosts_load() {
        let p = ImagePolicy::new(&["https://api.example.com", "cdn.shop.example", "http://127.0.0.1:8790"]);
        assert!(p.allows("https://api.example.com/a.png"));
        assert!(p.allows("HTTPS://API.example.com:443/a.png"));
        assert!(p.allows("https://cdn.shop.example/a.png"));
        assert!(p.allows("http://127.0.0.1:8790/a.png"));
        assert!(p.allows("data:image/png;base64,AAAA"));
        assert!(!p.allows("https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah"));
        assert!(!p.allows("http://api.example.com/a.png"), "plain http only on this machine");
        assert!(!p.allows("https://evil.example@api.example.com.evil.example/a.png"));
        assert!(!p.allows("//api.example.com/a.png"));
        assert!(!p.allows("javascript:alert(1)"));
        assert!(!ImagePolicy::default().allows("https://api.example.com/a.png"));
    }
}
