"""Where OpenEidon keeps things on disk.

Locations used to be derived from the source file's position on disk
(``Path(__file__).parents[4]``), which put generated projects in the drive
root of a development checkout and, once installed as a wheel, somewhere
inside the Python installation. They are anchored to the user instead.
"""

from __future__ import annotations

import os
from pathlib import Path

#: Everything runtime lives here; overridable for tests and portable installs.
_CONFIG_ENV = "OPENEIDON_HOME"

#: Generated projects are the user's own work, so they go somewhere visible
#: rather than into a dot-directory.
_PROJECTS_ENV = "EIDON_PROJECTS_DIR"


def config_dir() -> Path:
    """Runtime data directory, ``~/.openeidon`` unless overridden."""
    override = os.environ.get(_CONFIG_ENV, "").strip()
    return Path(override).expanduser() if override else Path.home() / ".openeidon"


def projects_dir() -> Path:
    """Directory for projects the assistant generates.

    Defaults to ``~/Documents/Eidon Projects`` — a place the user can find
    without being told, and one that survives moving or reinstalling the
    package. ``EIDON_PROJECTS_DIR`` overrides it.
    """
    override = os.environ.get(_PROJECTS_ENV, "").strip()
    if override:
        return Path(override).expanduser()
    documents = Path.home() / "Documents"
    base = documents if documents.is_dir() else Path.home()
    return base / "Eidon Projects"


def safe_directory_name(value: str) -> str:
    """Trim a model-supplied name down to something a filesystem accepts."""
    cleaned = "".join(
        ch for ch in value.strip() if ch not in '<>:"/\\|?*'
    ).strip().rstrip(".")
    return cleaned or "project"


__all__ = ["config_dir", "projects_dir", "safe_directory_name"]
