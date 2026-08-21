"""OpenEidon — modular AI assistant backend with composable intelligence primitives."""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _pkg_version
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from openeidon.sdk import Eidon, EidonSystem, MemoryHandle, SystemBuilder

try:
    __version__ = _pkg_version("openeidon")
except PackageNotFoundError:  # pragma: no cover — uninstalled source tree
    __version__ = "0.0.0+unknown"

__all__ = ["Eidon", "EidonSystem", "MemoryHandle", "SystemBuilder", "__version__"]

_SDK_EXPORTS = {"Eidon", "EidonSystem", "MemoryHandle", "SystemBuilder"}


def __getattr__(name: str):  # PEP 562 — keep `import openeidon` cheap
    if name in _SDK_EXPORTS:
        from openeidon import sdk

        return getattr(sdk, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
