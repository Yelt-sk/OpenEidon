"""OpenEidon — modular AI assistant backend with composable intelligence primitives."""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _pkg_version

from openeidon.sdk import Eidon, EidonSystem, MemoryHandle, SystemBuilder

try:
    __version__ = _pkg_version("openeidon")
except PackageNotFoundError:  # pragma: no cover — uninstalled source tree
    __version__ = "0.0.0+unknown"

__all__ = ["Eidon", "EidonSystem", "MemoryHandle", "SystemBuilder", "__version__"]
