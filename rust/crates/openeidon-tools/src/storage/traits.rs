//! MemoryBackend trait for all storage backends.

use openeidon_core::{OpenEidonError, RetrievalResult};
use serde_json::Value;

pub trait MemoryBackend: Send + Sync {
    fn backend_id(&self) -> &str;
    fn store(
        &self,
        content: &str,
        source: &str,
        metadata: Option<&Value>,
    ) -> Result<String, OpenEidonError>;
    fn retrieve(
        &self,
        query: &str,
        top_k: usize,
    ) -> Result<Vec<RetrievalResult>, OpenEidonError>;
    fn delete(&self, doc_id: &str) -> Result<bool, OpenEidonError>;
    fn clear(&self) -> Result<(), OpenEidonError>;
    fn count(&self) -> Result<usize, OpenEidonError>;
}
