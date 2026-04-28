//! MemoryBackend trait for all storage backends.

use openjarvis_core::{OpenJarvisError, RetrievalResult};
use serde_json::Value;

pub trait MemoryBackend: Send + Sync {
    fn backend_id(&self) -> &str;
    fn store(
        &self,
        content: &str,
        source: &str,
        metadata: Option<&Value>,
    ) -> Result<String, OpenJarvisError>;
    fn retrieve(
        &self,
        query: &str,
        top_k: usize,
    ) -> Result<Vec<RetrievalResult>, OpenJarvisError>;
    fn delete(&self, doc_id: &str) -> Result<bool, OpenJarvisError>;
    fn clear(&self) -> Result<(), OpenJarvisError>;
    fn count(&self) -> Result<usize, OpenJarvisError>;
}
