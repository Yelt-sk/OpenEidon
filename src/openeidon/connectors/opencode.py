"""OpenCode bridge — delegate coding tasks to a local `opencode serve` instance.

OpenCode (https://opencode.ai) is a terminal coding agent with a headless HTTP
server mode.  This module manages that server process and exposes a small
typed client used by the ``code_agent`` tool and the ``/v1/code`` routes.

Security model: every session is created for an explicit project directory,
which must live under the server's allowed file roots.  OpenCode permission
requests are surfaced to the caller instead of being auto-approved.
"""

from __future__ import annotations

import logging
import shutil
import socket
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

_START_TIMEOUT_SECONDS = 30.0
_REQUEST_TIMEOUT = httpx.Timeout(30.0, read=600.0)


class OpenCodeError(RuntimeError):
    """Raised when the OpenCode server cannot be reached or errors out."""


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@dataclass
class OpenCodeManager:
    """Own the lifecycle of one `opencode serve` subprocess."""

    binary: str = "opencode"
    port: int = 0
    hostname: str = "127.0.0.1"
    _process: Optional[subprocess.Popen] = field(default=None, repr=False)
    _client: Optional[httpx.Client] = field(default=None, repr=False)

    @property
    def base_url(self) -> str:
        return f"http://{self.hostname}:{self.port}"

    def available(self) -> bool:
        """True when the opencode binary is installed."""
        return self._resolve_binary() is not None

    def _resolve_binary(self) -> Optional[str]:
        """Full path to the binary (on Windows the npm shim is opencode.cmd)."""
        return shutil.which(self.binary)

    def is_running(self) -> bool:
        if self._process is not None and self._process.poll() is None:
            return self._health()
        return False

    def _health(self) -> bool:
        try:
            resp = self.client.get("/global/health", timeout=5.0)
            return resp.status_code == 200
        except httpx.HTTPError:
            return False

    @property
    def client(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(
                base_url=self.base_url, timeout=_REQUEST_TIMEOUT
            )
        return self._client

    def start(self) -> None:
        """Start the server if it is not already running."""
        if self.is_running():
            return
        binary = self._resolve_binary()
        if binary is None:
            raise OpenCodeError(
                "opencode binary not found; install it with"
                " 'npm install -g opencode-ai'"
            )
        if self.port == 0:
            self.port = _free_port()
        self._close_client()
        logger.info("Starting opencode serve on %s", self.base_url)
        self._process = subprocess.Popen(
            [binary, "serve", "--port", str(self.port), "--hostname", self.hostname],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.monotonic() + _START_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            if self._process.poll() is not None:
                raise OpenCodeError(
                    f"opencode serve exited with code {self._process.returncode}"
                )
            if self._health():
                return
            time.sleep(0.4)
        self.stop()
        raise OpenCodeError("opencode serve did not become healthy in time")

    def stop(self) -> None:
        self._close_client()
        if self._process is not None and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._process.kill()
        self._process = None

    def _close_client(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None

    # ------------------------------------------------------------------
    # Session API
    # ------------------------------------------------------------------

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        try:
            resp = self.client.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            raise OpenCodeError(f"opencode request failed: {exc}") from exc
        if resp.status_code >= 400:
            raise OpenCodeError(
                f"opencode {method} {path} -> {resp.status_code}: {resp.text[:500]}"
            )
        if resp.headers.get("content-type", "").startswith("application/json"):
            return resp.json()
        return resp.text

    def create_session(self, directory: str | Path, title: str = "") -> dict:
        """Create an opencode session rooted at *directory*."""
        payload: dict[str, Any] = {}
        if title:
            payload["title"] = title
        return self._request(
            "POST",
            "/session",
            params={"directory": str(directory)},
            json=payload,
        )

    def list_sessions(self) -> list[dict]:
        return self._request("GET", "/session")

    def prompt(
        self,
        session_id: str,
        text: str,
        *,
        directory: str | Path | None = None,
        model: str | None = None,
        agent: str | None = None,
        wait: bool = True,
    ) -> dict:
        """Send a task to a session; blocks until done when *wait* is true."""
        body: dict[str, Any] = {"parts": [{"type": "text", "text": text}]}
        if model and "/" in model:
            provider_id, model_id = model.split("/", 1)
            body["model"] = {"providerID": provider_id, "modelID": model_id}
        if agent:
            body["agent"] = agent
        params = {"directory": str(directory)} if directory else None
        endpoint = "message" if wait else "prompt_async"
        return self._request(
            "POST", f"/session/{session_id}/{endpoint}", json=body, params=params
        )

    def messages(self, session_id: str) -> list[dict]:
        return self._request("GET", f"/session/{session_id}/message")

    def status(self) -> Any:
        return self._request("GET", "/session/status")

    def diff(self, session_id: str) -> Any:
        return self._request("GET", f"/session/{session_id}/diff")

    def abort(self, session_id: str) -> Any:
        return self._request("POST", f"/session/{session_id}/abort")

    def respond_permission(
        self, session_id: str, permission_id: str, response: str
    ) -> Any:
        """Answer a pending permission request: response is 'once'/'always'/'reject'."""
        return self._request(
            "POST",
            f"/session/{session_id}/permissions/{permission_id}",
            json={"response": response},
        )


# Module-level singleton used by the tool and the server routes.
_manager: Optional[OpenCodeManager] = None


def get_manager() -> OpenCodeManager:
    global _manager
    if _manager is None:
        _manager = OpenCodeManager()
    return _manager


def extract_text_reply(messages: list[dict]) -> str:
    """Pull the final assistant text out of an opencode message list."""
    for message in reversed(messages):
        info = message.get("info", message)
        if info.get("role") != "assistant":
            continue
        parts = message.get("parts", [])
        chunks = [
            p.get("text", "")
            for p in parts
            if p.get("type") == "text" and p.get("text")
        ]
        if chunks:
            return "\n".join(chunks).strip()
    return ""
