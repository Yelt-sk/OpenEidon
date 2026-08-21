"""Data source connectors for Deep Research."""

from openeidon.connectors._stubs import (
    Attachment,
    BaseConnector,
    Document,
    SyncStatus,
)
from openeidon.connectors.store import KnowledgeStore

__all__ = ["Attachment", "BaseConnector", "Document", "KnowledgeStore", "SyncStatus"]

# Auto-register built-in connectors
import openeidon.connectors.obsidian  # noqa: F401

try:
    import openeidon.connectors.gmail  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.gmail_imap  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.gdrive  # noqa: F401
except ImportError:
    pass  # httpx may not be installed

try:
    import openeidon.connectors.notion  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.granola  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.gcontacts  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.imessage  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.apple_notes  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.apple_music  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.slack_connector  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.outlook  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.gcalendar  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.dropbox  # noqa: F401
except ImportError:
    pass  # httpx may not be installed

try:
    import openeidon.connectors.whatsapp  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.oura  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.apple_health  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.strava  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.spotify  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.google_tasks  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.weather  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.github_notifications  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.hackernews  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.connectors.news_rss  # noqa: F401
except ImportError:
    pass
