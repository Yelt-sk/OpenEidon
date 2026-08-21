//! SSRF protection — block requests to private IPs and cloud metadata endpoints.

use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, ToSocketAddrs};

static BLOCKED_HOSTS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "169.254.169.254",
        "metadata.google.internal",
        "metadata.google.com",
        "100.100.100.200",
    ])
});

/// Check if an IP address is private/reserved.
pub fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || is_in_cidr_v4(v4, Ipv4Addr::new(169, 254, 0, 0), 16)
                || *v4 == Ipv4Addr::UNSPECIFIED
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || is_ula_v6(v6)
                || is_link_local_v6(v6)
        }
    }
}

fn is_in_cidr_v4(addr: &Ipv4Addr, network: Ipv4Addr, prefix_len: u32) -> bool {
    let mask = if prefix_len == 0 {
        0u32
    } else {
        !0u32 << (32 - prefix_len)
    };
    (u32::from(*addr) & mask) == (u32::from(network) & mask)
}

fn is_ula_v6(addr: &Ipv6Addr) -> bool {
    let segments = addr.segments();
    (segments[0] & 0xfe00) == 0xfc00
}

fn is_link_local_v6(addr: &Ipv6Addr) -> bool {
    let segments = addr.segments();
    (segments[0] & 0xffc0) == 0xfe80
}

/// Check a URL for SSRF vulnerabilities.
/// Returns an error message or None if safe.
pub fn check_ssrf(url_str: &str) -> Option<String> {
    let parsed = match url::Url::parse(url_str) {
        Ok(u) => u,
        Err(_) => return Some("Invalid URL".into()),
    };

    let hostname = match parsed.host_str() {
        Some(h) => h,
        None => return Some("No hostname in URL".into()),
    };

    if BLOCKED_HOSTS.contains(hostname) {
        return Some(format!(
            "Blocked host: {} (cloud metadata endpoint)",
            hostname
        ));
    }

    let port = parsed.port().unwrap_or(match parsed.scheme() {
        "https" => 443,
        _ => 80,
    });

    let addr_str = format!("{}:{}", hostname, port);
    if let Ok(addrs) = addr_str.to_socket_addrs() {
        for addr in addrs {
            if is_private_ip(&addr.ip()) {
                return Some(format!("URL resolves to private IP: {}", addr.ip()));
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_private_ip_detection() {
        assert!(is_private_ip(&IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1))));
        assert!(is_private_ip(&IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1))));
        assert!(is_private_ip(&IpAddr::V4(Ipv4Addr::new(172, 16, 0, 1))));
        assert!(is_private_ip(&IpAddr::V4(Ipv4Addr::LOCALHOST)));
    }

    #[test]
    fn test_public_ip_allowed() {
        assert!(!is_private_ip(&IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8))));
        assert!(!is_private_ip(&IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1))));
    }

    #[test]
    fn test_blocked_metadata_host() {
        let result = check_ssrf("http://169.254.169.254/latest/meta-data/");
        assert!(result.is_some());
        assert!(result.unwrap().contains("Blocked host"));
    }

    #[test]
    fn test_invalid_url() {
        let result = check_ssrf("not-a-url");
        assert!(result.is_some());
    }
}
