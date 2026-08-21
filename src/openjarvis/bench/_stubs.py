"""ABC for benchmark implementations and the BenchmarkSuite runner."""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from openjarvis.engine._stubs import InferenceEngine


@dataclass(slots=True)
class BenchmarkResult:
    """Result from running a single benchmark."""

    benchmark_name: str
    model: str
    engine: str
    metrics: Dict[str, float] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    samples: int = 0
    errors: int = 0
    warmup_samples: int = 0
    steady_state_samples: int = 0
    steady_state_reached: bool = False
    total_energy_joules: float = 0.0
    energy_per_token_joules: float = 0.0
    energy_method: str = ""


class BaseBenchmark(ABC):
    """Base class for all benchmark implementations.

    Subclasses must be registered via
    ``@BenchmarkRegistry.register("name")`` to become discoverable.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Short identifier for this benchmark."""

    @property
    @abstractmethod
    def description(self) -> str:
        """Human-readable description of what this benchmark measures."""

    @abstractmethod
    def run(
        self,
        engine: InferenceEngine,
        model: str,
        *,
        num_samples: int = 10,
        **kwargs: Any,
    ) -> BenchmarkResult:
        """Execute the benchmark and return results."""


class BenchmarkSuite:
    """Run a collection of benchmarks and aggregate results."""

    def __init__(self, benchmarks: Optional[List[BaseBenchmark]] = None) -> None:
        self._benchmarks = benchmarks or []

    def run_all(
        self,
        engine: InferenceEngine,
        model: str,
        *,
        num_samples: int = 10,
        **kwargs: Any,
    ) -> List[BenchmarkResult]:
        """Run all benchmarks and return a list of results."""
        results: List[BenchmarkResult] = []
        for bench in self._benchmarks:
            result = bench.run(engine, model, num_samples=num_samples, **kwargs)
            results.append(result)
        return results

    def to_jsonl(self, results: List[BenchmarkResult]) -> str:
        """Serialize results to JSONL format (one JSON object per line)."""
        lines: List[str] = []
        for r in results:
            obj = {
                "benchmark_name": r.benchmark_name,
                "model": r.model,
                "engine": r.engine,
                "metrics": r.metrics,
                "metadata": r.metadata,
                "samples": r.samples,
                "errors": r.errors,
            }
            lines.append(json.dumps(obj))
        return "\n".join(lines)

    def summary(self, results: List[BenchmarkResult]) -> Dict[str, Any]:
        """Create a summary dict from benchmark results."""
        return {
            "benchmark_count": len(results),
            "benchmarks": [
                {
                    "name": r.benchmark_name,
                    "model": r.model,
                    "engine": r.engine,
                    "metrics": r.metrics,
                    "samples": r.samples,
                    "errors": r.errors,
                }
                for r in results
            ],
        }


__all__ = ["BaseBenchmark", "BenchmarkResult", "BenchmarkSuite"]
