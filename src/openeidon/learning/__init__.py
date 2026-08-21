"""Learning primitive -- router policies, reward functions, learning."""

from __future__ import annotations

from openeidon.learning._stubs import (
    QueryAnalyzer,
    RewardFunction,
    RouterPolicy,
    RoutingContext,
)
from openeidon.learning.agents.agent_evolver import AgentConfigEvolver
from openeidon.learning.learning_orchestrator import LearningOrchestrator
from openeidon.learning.optimize.llm_optimizer import LLMOptimizer
from openeidon.learning.optimize.optimizer import OptimizationEngine
from openeidon.learning.optimize.store import OptimizationStore
from openeidon.learning.routing.complexity import (
    ComplexityQueryAnalyzer,
    score_complexity,
)
from openeidon.learning.routing.heuristic_reward import HeuristicRewardFunction
from openeidon.learning.routing.router import (
    HeuristicRouter,
    build_routing_context,
)
from openeidon.learning.training.data import TrainingDataMiner
from openeidon.learning.training.lora import HAS_TORCH, LoRATrainer, LoRATrainingConfig


def ensure_registered() -> None:
    """Ensure all learning policies are registered in RouterPolicyRegistry."""
    from openeidon.learning.routing.heuristic_policy import (
        ensure_registered as _reg_heuristic,
    )

    _reg_heuristic()

    from openeidon.learning.routing.learned_router import (
        ensure_registered as _reg_learned,
    )

    _reg_learned()

    # Intelligence training (optional deps)
    try:
        import openeidon.learning.intelligence  # noqa: F401
    except ImportError:
        pass

    # Orchestrator-specific training (optional deps)
    try:
        import openeidon.learning.intelligence.orchestrator  # noqa: F401
    except ImportError:
        pass

    # Agent optimizers (optional deps)
    try:
        import openeidon.learning.agents.dspy_optimizer  # noqa: F401
    except ImportError:
        pass
    try:
        import openeidon.learning.agents.gepa_optimizer  # noqa: F401
    except ImportError:
        pass


__all__ = [
    "AgentConfigEvolver",
    "ComplexityQueryAnalyzer",
    "HAS_TORCH",
    "HeuristicRewardFunction",
    "HeuristicRouter",
    "LLMOptimizer",
    "LearningOrchestrator",
    "LoRATrainer",
    "LoRATrainingConfig",
    "OptimizationEngine",
    "OptimizationStore",
    "QueryAnalyzer",
    "RewardFunction",
    "RouterPolicy",
    "RoutingContext",
    "TrainingDataMiner",
    "build_routing_context",
    "ensure_registered",
    "score_complexity",
]
