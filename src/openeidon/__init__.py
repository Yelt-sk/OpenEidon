"""OpenEidon — modular AI assistant backend with composable intelligence primitives."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from openeidon.sdk import Eidon, EidonSystem, MemoryHandle, SystemBuilder

__all__ = ["Eidon", "EidonSystem", "MemoryHandle", "SystemBuilder", "__version__"]

_SDK_EXPORTS = {"Eidon", "EidonSystem", "MemoryHandle", "SystemBuilder"}


def __getattr__(name: str):  # PEP 562 — keep `import openeidon` cheap
    if name in _SDK_EXPORTS:
        from openeidon import sdk

        return getattr(sdk, name)
    if name == "__version__":
        from importlib.metadata import PackageNotFoundError, version

        try:
            v = version("openeidon")
        except PackageNotFoundError:  # pragma: no cover — uninstalled source tree
            v = "0.0.0+unknown"
        globals()["__version__"] = v
        return v
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
