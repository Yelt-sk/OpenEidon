//! PyO3 bindings for security types.

use pyo3::prelude::*;

#[pyclass(name = "SecretScanner")]
pub struct PySecretScanner {
    inner: openeidon_security::SecretScanner,
}

#[pymethods]
impl PySecretScanner {
    #[new]
    fn new() -> Self {
        Self {
            inner: openeidon_security::SecretScanner::new(),
        }
    }

    fn scan(&self, text: &str) -> PyResult<String> {
        let result = self.inner.scan(text);
        Ok(serde_json::to_string(&result).unwrap_or_default())
    }

    fn redact(&self, text: &str) -> String {
        self.inner.redact(text)
    }
}

#[pyclass(name = "PIIScanner")]
pub struct PyPIIScanner {
    inner: openeidon_security::PIIScanner,
}

#[pymethods]
impl PyPIIScanner {
    #[new]
    fn new() -> Self {
        Self {
            inner: openeidon_security::PIIScanner::new(),
        }
    }

    fn scan(&self, text: &str) -> PyResult<String> {
        let result = self.inner.scan(text);
        Ok(serde_json::to_string(&result).unwrap_or_default())
    }

    fn redact(&self, text: &str) -> String {
        self.inner.redact(text)
    }
}

#[pyclass(name = "GuardrailsEngine")]
pub struct PyGuardrailsEngine {
    inner: openeidon_security::GuardrailsEngine<openeidon_engine::Engine>,
}

#[pymethods]
impl PyGuardrailsEngine {
    #[new]
    #[pyo3(signature = (engine_key="ollama", host="http://localhost:11434", mode="warn", scan_input=true, scan_output=true))]
    fn new(
        engine_key: &str,
        host: &str,
        mode: &str,
        scan_input: bool,
        scan_output: bool,
    ) -> PyResult<Self> {
        let config = openeidon_core::EidonConfig::default();
        let engine = openeidon_engine::get_engine_static(&config, Some(engine_key))
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))?;
        let redaction_mode = match mode {
            "redact" => openeidon_security::RedactionMode::Redact,
            "block" => openeidon_security::RedactionMode::Block,
            _ => openeidon_security::RedactionMode::Warn,
        };
        Ok(Self {
            inner: openeidon_security::GuardrailsEngine::new(
                engine,
                redaction_mode,
                scan_input,
                scan_output,
                None,
            ),
        })
    }

    fn engine_id(&self) -> &str {
        use openeidon_engine::InferenceEngine;
        self.inner.engine_id()
    }
}

#[pyclass(name = "AuditLogger")]
pub struct PyAuditLogger {
    inner: parking_lot::Mutex<openeidon_security::AuditLogger>,
}

#[pymethods]
impl PyAuditLogger {
    #[new]
    #[pyo3(signature = (path=None))]
    fn new(path: Option<&str>) -> PyResult<Self> {
        let db_path = match path {
            Some(p) => std::path::PathBuf::from(p),
            None => std::path::PathBuf::from(":memory:"),
        };
        let inner = openeidon_security::AuditLogger::new(&db_path)
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))?;
        Ok(Self {
            inner: parking_lot::Mutex::new(inner),
        })
    }

    fn count(&self) -> i64 {
        self.inner.lock().count()
    }

    fn verify_chain(&self) -> PyResult<(bool, Option<i64>)> {
        self.inner
            .lock()
            .verify_chain()
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))
    }

    fn tail_hash(&self) -> String {
        self.inner.lock().tail_hash()
    }
}

#[pyclass(name = "CapabilityPolicy")]
pub struct PyCapabilityPolicy {
    inner: openeidon_security::CapabilityPolicy,
}

#[pymethods]
impl PyCapabilityPolicy {
    #[new]
    #[pyo3(signature = (default_deny=true))]
    fn new(default_deny: bool) -> Self {
        Self {
            inner: openeidon_security::CapabilityPolicy::new(default_deny),
        }
    }

    fn check(&self, agent_id: &str, capability: &str, resource: &str) -> bool {
        self.inner.check(agent_id, capability, resource)
    }

    fn grant(&mut self, agent_id: &str, capability: &str, pattern: &str) {
        self.inner.grant(agent_id, capability, pattern);
    }

    fn deny(&mut self, agent_id: &str, capability: &str) {
        self.inner.deny(agent_id, capability);
    }

    fn list_agents(&self) -> Vec<String> {
        self.inner.list_agents()
    }
}

#[pyclass(name = "InjectionScanner")]
pub struct PyInjectionScanner {
    inner: openeidon_security::InjectionScanner,
}

#[pymethods]
impl PyInjectionScanner {
    #[new]
    fn new() -> Self {
        Self {
            inner: openeidon_security::InjectionScanner::new(),
        }
    }

    fn scan(&self, text: &str) -> PyResult<String> {
        let result = self.inner.scan(text);
        serde_json::to_string(&result)
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))
    }
}

#[pyclass(name = "RateLimiter")]
pub struct PyRateLimiter {
    inner: openeidon_security::RateLimiter,
}

#[pymethods]
impl PyRateLimiter {
    #[new]
    #[pyo3(signature = (requests_per_minute=60, burst_size=10))]
    fn new(requests_per_minute: u32, burst_size: u32) -> Self {
        Self {
            inner: openeidon_security::RateLimiter::new(
                openeidon_security::RateLimitConfig {
                    requests_per_minute,
                    burst_size,
                    enabled: true,
                },
            ),
        }
    }

    /// Returns (allowed, wait_seconds).
    fn check(&self, key: &str) -> (bool, f64) {
        self.inner.check(key)
    }

    #[pyo3(signature = (key=None))]
    fn reset(&self, key: Option<&str>) {
        self.inner.reset(key);
    }
}

#[pyclass(name = "TaintSet")]
pub struct PyTaintSet {
    inner: openeidon_security::TaintSet,
}

#[pymethods]
impl PyTaintSet {
    #[new]
    fn new() -> Self {
        Self {
            inner: openeidon_security::TaintSet::new(),
        }
    }

    fn add(&mut self, label: &str) {
        let taint_label = match label {
            "pii" => openeidon_security::TaintLabel::Pii,
            "secret" => openeidon_security::TaintLabel::Secret,
            "user_private" => openeidon_security::TaintLabel::UserPrivate,
            "external" => openeidon_security::TaintLabel::External,
            _ => openeidon_security::TaintLabel::External,
        };
        // TaintSet is immutable-style; union with a single-label set.
        self.inner = self.inner.union(
            &openeidon_security::TaintSet::from_labels(&[taint_label]),
        );
    }

    fn has(&self, label: &str) -> bool {
        let taint_label = match label {
            "pii" => openeidon_security::TaintLabel::Pii,
            "secret" => openeidon_security::TaintLabel::Secret,
            "user_private" => openeidon_security::TaintLabel::UserPrivate,
            "external" => openeidon_security::TaintLabel::External,
            _ => return false,
        };
        self.inner.has(taint_label)
    }

    fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }
}
