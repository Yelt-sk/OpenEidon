"""Operators — persistent, scheduled autonomous agents."""

from openeidon.operators.loader import load_operator
from openeidon.operators.manager import OperatorManager
from openeidon.operators.types import OperatorManifest

__all__ = ["OperatorManifest", "OperatorManager", "load_operator"]
