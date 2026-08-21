//! File sensitivity policy — block access to secrets, credentials, and keys.

use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::path::Path;

static SENSITIVE_PATTERNS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        ".env",
        ".secret",
        "id_rsa",
        "id_ed25519",
        ".htpasswd",
        ".pgpass",
        ".netrc",
    ])
});

static SENSITIVE_EXTENSIONS: Lazy<Vec<&'static str>> = Lazy::new(|| {
    vec![
        ".pem", ".key", ".p12", ".pfx", ".jks", ".secrets",
    ]
});

static SENSITIVE_PREFIXES: Lazy<Vec<&'static str>> = Lazy::new(|| {
    vec![".env.", "credentials."]
});

/// Return `true` if path matches a sensitive file pattern.
pub fn is_sensitive_file(path: &Path) -> bool {
    let name = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return false,
    };

    if SENSITIVE_PATTERNS.contains(name) {
        return true;
    }

    for ext in SENSITIVE_EXTENSIONS.iter() {
        if name.ends_with(ext) {
            return true;
        }
    }

    for prefix in SENSITIVE_PREFIXES.iter() {
        if name.starts_with(prefix) {
            return true;
        }
    }

    false
}

/// Return only non-sensitive paths.
pub fn filter_sensitive_paths<'a>(paths: &'a [&'a Path]) -> Vec<&'a Path> {
    paths
        .iter()
        .filter(|p| !is_sensitive_file(p))
        .copied()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sensitive_files() {
        assert!(is_sensitive_file(Path::new(".env")));
        assert!(is_sensitive_file(Path::new(".env.local")));
        assert!(is_sensitive_file(Path::new("server.key")));
        assert!(is_sensitive_file(Path::new("cert.pem")));
        assert!(is_sensitive_file(Path::new("id_rsa")));
        assert!(is_sensitive_file(Path::new("credentials.json")));
    }

    #[test]
    fn test_safe_files() {
        assert!(!is_sensitive_file(Path::new("main.py")));
        assert!(!is_sensitive_file(Path::new("README.md")));
        assert!(!is_sensitive_file(Path::new("config.toml")));
    }
}
