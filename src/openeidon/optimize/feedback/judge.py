"""Backward-compat shim: moved to learning.optimize."""

from openeidon.learning.optimize.feedback.judge import *  # noqa: F401,F403
from openeidon.learning.optimize.feedback.judge import (
    __all__,  # noqa: F401
    _parse_score,  # noqa: F401
)
