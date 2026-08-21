"""Backward-compatibility shim -- optimize.store moved to learning.optimize.store."""

from openeidon.learning.optimize.store import *  # noqa: F401,F403
from openeidon.learning.optimize.store import __all__  # noqa: F401
