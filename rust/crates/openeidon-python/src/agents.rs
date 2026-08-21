//! PyO3 bindings for agent types.
//!
//! Uses `AgentEnum` for static dispatch instead of `Box<dyn OjAgent>`.

use crate::core::PyAgentResult;
use crate::RUNTIME;
use openeidon_agents::OjAgent;
use openeidon_engine::rig_adapter::RigModelAdapter;
use openeidon_engine::Engine;
use pyo3::prelude::*;
use std::sync::Arc;

type DefaultAdapter = RigModelAdapter<Engine>;

enum AgentEnum {
    Simple(openeidon_agents::SimpleAgent<DefaultAdapter>),
    Orchestrator(openeidon_agents::OrchestratorAgent<DefaultAdapter>),
    NativeReAct(openeidon_agents::NativeReActAgent<DefaultAdapter>),
}

impl AgentEnum {
    fn agent_id(&self) -> &str {
        match self {
            AgentEnum::Simple(a) => a.agent_id(),
            AgentEnum::Orchestrator(a) => a.agent_id(),
            AgentEnum::NativeReAct(a) => a.agent_id(),
        }
    }

    fn accepts_tools(&self) -> bool {
        match self {
            AgentEnum::Simple(a) => a.accepts_tools(),
            AgentEnum::Orchestrator(a) => a.accepts_tools(),
            AgentEnum::NativeReAct(a) => a.accepts_tools(),
        }
    }

    async fn run(
        &self,
        input: &str,
        context: Option<&openeidon_core::AgentContext>,
    ) -> Result<openeidon_core::AgentResult, openeidon_core::OpenEidonError> {
        match self {
            AgentEnum::Simple(a) => a.run(input, context).await,
            AgentEnum::Orchestrator(a) => a.run(input, context).await,
            AgentEnum::NativeReAct(a) => a.run(input, context).await,
        }
    }
}

fn make_adapter(engine_key: &str, model: &str) -> PyResult<DefaultAdapter> {
    let config = openeidon_core::EidonConfig::default();
    let engine = openeidon_engine::get_engine_static(&config, Some(engine_key))
        .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))?;
    Ok(RigModelAdapter::new(Arc::new(engine), model.to_string()))
}

#[pyclass(name = "SimpleAgent")]
pub struct PySimpleAgent {
    inner: AgentEnum,
}

#[pymethods]
impl PySimpleAgent {
    #[new]
    #[pyo3(signature = (engine_key="ollama", host="http://localhost:11434", model="qwen3:8b", system_prompt="You are a helpful assistant.", temperature=0.7))]
    fn new(
        engine_key: &str,
        host: &str,
        model: &str,
        system_prompt: &str,
        temperature: f64,
    ) -> PyResult<Self> {
        let adapter = make_adapter(engine_key, model)?;
        let agent = openeidon_agents::SimpleAgent::new(adapter, system_prompt, temperature);
        Ok(Self { inner: AgentEnum::Simple(agent) })
    }

    fn agent_id(&self) -> &str {
        self.inner.agent_id()
    }

    fn accepts_tools(&self) -> bool {
        self.inner.accepts_tools()
    }

    fn run(&self, input: &str) -> PyResult<PyAgentResult> {
        let result = RUNTIME
            .block_on(self.inner.run(input, None))
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))?;
        Ok(PyAgentResult {
            content: result.content,
            turns: result.turns,
        })
    }
}

#[pyclass(name = "OrchestratorAgent")]
pub struct PyOrchestratorAgent {
    inner: AgentEnum,
}

#[pymethods]
impl PyOrchestratorAgent {
    #[new]
    #[pyo3(signature = (engine_key="ollama", host="http://localhost:11434", model="qwen3:8b", system_prompt="You are a helpful orchestrator agent.", max_turns=10, temperature=0.7))]
    fn new(
        engine_key: &str,
        host: &str,
        model: &str,
        system_prompt: &str,
        max_turns: usize,
        temperature: f64,
    ) -> PyResult<Self> {
        let adapter = make_adapter(engine_key, model)?;
        let executor = Arc::new(openeidon_tools::ToolExecutor::new(None, None));
        let agent = openeidon_agents::OrchestratorAgent::new(
            adapter, system_prompt, executor, max_turns, temperature,
        );
        Ok(Self { inner: AgentEnum::Orchestrator(agent) })
    }

    fn agent_id(&self) -> &str {
        self.inner.agent_id()
    }

    fn accepts_tools(&self) -> bool {
        self.inner.accepts_tools()
    }

    fn run(&self, input: &str) -> PyResult<PyAgentResult> {
        let result = RUNTIME
            .block_on(self.inner.run(input, None))
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))?;
        Ok(PyAgentResult {
            content: result.content,
            turns: result.turns,
        })
    }
}

#[pyclass(name = "NativeReActAgent")]
pub struct PyNativeReActAgent {
    inner: AgentEnum,
}

#[pymethods]
impl PyNativeReActAgent {
    #[new]
    #[pyo3(signature = (engine_key="ollama", host="http://localhost:11434", model="qwen3:8b", max_turns=10, temperature=0.7))]
    fn new(
        engine_key: &str,
        host: &str,
        model: &str,
        max_turns: usize,
        temperature: f64,
    ) -> PyResult<Self> {
        let adapter = make_adapter(engine_key, model)?;
        let executor = Arc::new(openeidon_tools::ToolExecutor::new(None, None));
        let agent = openeidon_agents::NativeReActAgent::new(
            adapter, executor, max_turns, temperature,
        );
        Ok(Self { inner: AgentEnum::NativeReAct(agent) })
    }

    fn agent_id(&self) -> &str {
        self.inner.agent_id()
    }

    fn accepts_tools(&self) -> bool {
        self.inner.accepts_tools()
    }

    fn run(&self, input: &str) -> PyResult<PyAgentResult> {
        let result = RUNTIME
            .block_on(self.inner.run(input, None))
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))?;
        Ok(PyAgentResult {
            content: result.content,
            turns: result.turns,
        })
    }
}

/// Python wrapper for NativeOpenHandsAgent.
#[pyclass(name = "NativeOpenHandsAgent")]
pub struct PyNativeOpenHandsAgent {
    inner: Box<dyn OjAgent>,
}

#[pymethods]
impl PyNativeOpenHandsAgent {
    #[new]
    #[pyo3(signature = (engine_key="ollama", host="http://localhost:11434", model="qwen3:8b", max_turns=10, temperature=0.7))]
    fn new(
        engine_key: &str,
        host: &str,
        model: &str,
        max_turns: usize,
        temperature: f64,
    ) -> PyResult<Self> {
        let config = openeidon_core::EidonConfig::default();
        let engine = openeidon_engine::get_engine_static(&config, Some(engine_key))
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))?;
        let adapter = openeidon_engine::rig_adapter::RigModelAdapter::new(
            Arc::new(engine),
            model.to_string(),
        );
        let executor = Arc::new(openeidon_tools::ToolExecutor::new(None, None));
        let agent = openeidon_agents::NativeOpenHandsAgent::new(
            adapter,
            executor,
            max_turns,
            temperature,
        );
        Ok(Self {
            inner: Box::new(agent),
        })
    }

    fn agent_id(&self) -> &str {
        self.inner.agent_id()
    }

    fn accepts_tools(&self) -> bool {
        self.inner.accepts_tools()
    }

    fn run(&self, input: &str) -> PyResult<PyAgentResult> {
        let result = RUNTIME
            .block_on(self.inner.run(input, None))
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))?;
        Ok(PyAgentResult {
            content: result.content,
            turns: result.turns,
        })
    }
}

/// Python wrapper for MonitorOperativeAgent.
#[pyclass(name = "MonitorOperativeAgent")]
pub struct PyMonitorOperativeAgent {
    inner: Box<dyn OjAgent>,
}

#[pymethods]
impl PyMonitorOperativeAgent {
    /// Create a MonitorOperativeAgent.
    ///
    /// Strategy parameters are strings:
    /// - `memory_extraction`: "causality_graph" | "scratchpad" | "structured_json" | "none"
    /// - `observation_compression`: "summarize" | "truncate" | "none"
    /// - `retrieval_strategy`: "hybrid_with_self_eval" | "keyword" | "semantic" | "none"
    /// - `task_decomposition`: "phased" | "monolithic" | "hierarchical"
    #[new]
    #[pyo3(signature = (
        engine_key="ollama",
        host="http://localhost:11434",
        model="qwen3:8b",
        max_turns=10,
        temperature=0.7,
        memory_extraction="causality_graph",
        observation_compression="summarize",
        retrieval_strategy="hybrid_with_self_eval",
        task_decomposition="phased",
        compression_threshold=2000,
        truncation_limit=2000
    ))]
    #[allow(clippy::too_many_arguments)]
    fn new(
        engine_key: &str,
        host: &str,
        model: &str,
        max_turns: usize,
        temperature: f64,
        memory_extraction: &str,
        observation_compression: &str,
        retrieval_strategy: &str,
        task_decomposition: &str,
        compression_threshold: usize,
        truncation_limit: usize,
    ) -> PyResult<Self> {
        let config = openeidon_core::EidonConfig::default();
        let engine = openeidon_engine::get_engine_static(&config, Some(engine_key))
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))?;
        let adapter = openeidon_engine::rig_adapter::RigModelAdapter::new(
            Arc::new(engine),
            model.to_string(),
        );
        let executor = Arc::new(openeidon_tools::ToolExecutor::new(None, None));

        let mem_ext = match memory_extraction {
            "scratchpad" => openeidon_agents::MemoryExtraction::Scratchpad,
            "structured_json" => openeidon_agents::MemoryExtraction::StructuredJson,
            "none" => openeidon_agents::MemoryExtraction::None,
            _ => openeidon_agents::MemoryExtraction::CausalityGraph,
        };
        let obs_comp = match observation_compression {
            "truncate" => openeidon_agents::ObservationCompression::Truncate,
            "none" => openeidon_agents::ObservationCompression::None,
            _ => openeidon_agents::ObservationCompression::Summarize,
        };
        let ret_strat = match retrieval_strategy {
            "keyword" => openeidon_agents::RetrievalStrategy::Keyword,
            "semantic" => openeidon_agents::RetrievalStrategy::Semantic,
            "none" => openeidon_agents::RetrievalStrategy::None,
            _ => openeidon_agents::RetrievalStrategy::HybridWithSelfEval,
        };
        let task_dec = match task_decomposition {
            "monolithic" => openeidon_agents::TaskDecomposition::Monolithic,
            "hierarchical" => openeidon_agents::TaskDecomposition::Hierarchical,
            _ => openeidon_agents::TaskDecomposition::Phased,
        };

        let monitor_config = openeidon_agents::MonitorConfig {
            memory_extraction: mem_ext,
            observation_compression: obs_comp,
            retrieval_strategy: ret_strat,
            task_decomposition: task_dec,
            compression_threshold,
            truncation_limit,
        };

        let agent = openeidon_agents::MonitorOperativeAgent::new(
            adapter,
            executor,
            max_turns,
            temperature,
            monitor_config,
        );
        Ok(Self {
            inner: Box::new(agent),
        })
    }

    fn agent_id(&self) -> &str {
        self.inner.agent_id()
    }

    fn accepts_tools(&self) -> bool {
        self.inner.accepts_tools()
    }

    fn run(&self, input: &str) -> PyResult<PyAgentResult> {
        let result = RUNTIME
            .block_on(self.inner.run(input, None))
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))?;
        Ok(PyAgentResult {
            content: result.content,
            turns: result.turns,
        })
    }
}

/// Python wrapper for LoopGuard.
#[pyclass(name = "LoopGuard")]
pub struct PyLoopGuard {
    inner: openeidon_agents::LoopGuard,
}

#[pymethods]
impl PyLoopGuard {
    #[new]
    #[pyo3(signature = (max_identical=50, max_ping_pong=4, poll_budget=100))]
    fn new(max_identical: usize, max_ping_pong: usize, poll_budget: usize) -> Self {
        Self {
            inner: openeidon_agents::LoopGuard::new(max_identical, max_ping_pong, poll_budget),
        }
    }

    fn check(&mut self, tool_name: &str, arguments: &str) -> Option<String> {
        self.inner.check(tool_name, arguments)
    }

    fn reset(&mut self) {
        self.inner.reset()
    }
}
