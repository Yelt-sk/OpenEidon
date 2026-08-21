"""Browser automation tools — Playwright-based web interaction."""

from __future__ import annotations

import base64
import os
import threading
from pathlib import Path
from typing import Any

from openeidon.core.registry import ToolRegistry
from openeidon.core.types import ToolResult
from openeidon.tools._stubs import BaseTool, ToolSpec


class _BrowserSession:
    """Manages a shared Playwright browser session (lazy init)."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._shared_state = {
            "playwright": None,
            "browser": None,
            "page": None,
            "owner_thread_id": None,
        }

    def _state(self) -> dict[str, Any]:
        return self._shared_state

    def _session_is_stale(self, state: dict[str, Any]) -> bool:
        page = state["page"]
        browser = state["browser"]
        if page is None or browser is None:
            return True
        try:
            if page.is_closed():
                return True
        except Exception:
            return True
        try:
            if not browser.is_connected():
                return True
        except Exception:
            return True
        return False

    def _ensure_browser(self) -> None:
        with self._lock:
            state = self._state()
            current_thread_id = threading.get_ident()
            if (
                state["page"] is not None
                and state["owner_thread_id"] is not None
                and state["owner_thread_id"] != current_thread_id
            ):
                self.close()
                state = self._state()
            if state["page"] is not None and self._session_is_stale(state):
                self.close()
                state = self._state()
            if state["page"] is not None:
                return
            if "PLAYWRIGHT_BROWSERS_PATH" not in os.environ:
                project_browser_dir = (
                    Path(__file__).resolve().parents[3] / ".playwright-browsers"
                )
                if project_browser_dir.exists():
                    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(project_browser_dir)
            try:
                from playwright.sync_api import sync_playwright
            except ImportError:
                raise ImportError(
                    "playwright not installed. Install with: uv sync --extra browser"
                )
            state["playwright"] = sync_playwright().start()
            headless = os.environ.get("OPENEIDON_BROWSER_HEADLESS", "").lower() in {
                "1",
                "true",
                "yes",
                "on",
            }
            launch_kwargs: dict[str, Any] = {
                "headless": headless,
                "args": ["--new-window", "--disable-popup-blocking"],
            }
            if not headless:
                try:
                    state["browser"] = state["playwright"].chromium.launch(
                        channel="chrome",
                        **launch_kwargs,
                    )
                except Exception:
                    state["browser"] = state["playwright"].chromium.launch(
                        **launch_kwargs
                    )
            else:
                state["browser"] = state["playwright"].chromium.launch(**launch_kwargs)
            state["page"] = state["browser"].new_page()
            try:
                state["page"].bring_to_front()
            except Exception:
                pass
            state["owner_thread_id"] = current_thread_id

    @property
    def page(self):
        self._ensure_browser()
        return self._state()["page"]

    def close(self) -> None:
        with self._lock:
            state = self._state()
            if state["browser"]:
                try:
                    state["browser"].close()
                except Exception:
                    pass
            if state["playwright"]:
                try:
                    state["playwright"].stop()
                except Exception:
                    pass
            state["playwright"] = state["browser"] = state["page"] = None
            state["owner_thread_id"] = None


_session = _BrowserSession()


def _is_recoverable_browser_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(
        token in message
        for token in (
            "target page, context or browser has been closed",
            "browser has been closed",
            "event loop is closed",
            "thread",
            "playwright",
        )
    )


# ---------------------------------------------------------------------------
# Tool 1: BrowserNavigateTool
# ---------------------------------------------------------------------------


@ToolRegistry.register("browser_navigate")
class BrowserNavigateTool(BaseTool):
    """Navigate to a URL in the browser."""

    tool_id = "browser_navigate"
    is_local = False

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="browser_navigate",
            description=(
                "Navigate to a URL in the browser."
                " Returns the page title and text content."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "URL to navigate to.",
                    },
                    "wait_for": {
                        "type": "string",
                        "description": (
                            "Wait condition: 'load', 'domcontentloaded',"
                            " or 'networkidle'. Default: 'load'."
                        ),
                    },
                },
                "required": ["url"],
            },
            category="browser",
            required_capabilities=["network:fetch"],
        )

    def execute(self, **params: Any) -> ToolResult:
        url = params.get("url", "")
        if not url:
            return ToolResult(
                tool_name="browser_navigate",
                content="No URL provided.",
                success=False,
            )

        wait_for = params.get("wait_for", "load")
        if wait_for not in ("load", "domcontentloaded", "networkidle"):
            wait_for = "load"

        # SSRF check
        try:
            from openeidon.security.ssrf import check_ssrf

            ssrf_error = check_ssrf(url)
            if ssrf_error:
                return ToolResult(
                    tool_name="browser_navigate",
                    content=f"SSRF blocked: {ssrf_error}",
                    success=False,
                )
        except ImportError:
            pass  # ssrf module not available, skip check

        try:
            page = _session.page
            try:
                page.bring_to_front()
            except Exception:
                pass
            response = page.goto(url, wait_until=wait_for)
            title = page.title()
            text_content = page.inner_text("body")
            if len(text_content) > 5000:
                text_content = text_content[:5000] + "\n\n[Content truncated]"

            status = response.status if response else None
            return ToolResult(
                tool_name="browser_navigate",
                content=f"Title: {title}\n\n{text_content}",
                success=True,
                metadata={"url": url, "title": title, "status": status},
            )
        except ImportError:
            return ToolResult(
                tool_name="browser_navigate",
                content=(
                    "playwright not installed. Install with: uv sync --extra browser"
                ),
                success=False,
            )
        except Exception as exc:
            return ToolResult(
                tool_name="browser_navigate",
                content=f"Navigation error: {exc}",
                success=False,
            )


# ---------------------------------------------------------------------------
# Tool 2: BrowserClickTool
# ---------------------------------------------------------------------------


@ToolRegistry.register("browser_open_youtube_first_result")
class BrowserOpenYouTubeFirstResultTool(BaseTool):
    """Open YouTube search results and launch the first regular video result."""

    tool_id = "browser_open_youtube_first_result"
    is_local = False

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="browser_open_youtube_first_result",
            description=(
                "Search YouTube for a query and open the first regular video result."
                " Avoids playlists, mixes, channels, and side-panel links."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query to run on YouTube.",
                    },
                },
                "required": ["query"],
            },
            category="browser",
        )

    def execute(self, **params: Any) -> ToolResult:
        query = (params.get("query", "") or "").strip()
        if not query:
            return ToolResult(
                tool_name="browser_open_youtube_first_result",
                content="No query provided.",
                success=False,
            )

        try:
            from urllib.parse import quote_plus
        except ImportError:
            return ToolResult(
                tool_name="browser_open_youtube_first_result",
                content=(
                    "playwright not installed. Install with: uv sync --extra browser"
                ),
                success=False,
            )

        def _open_first_result() -> ToolResult:
            page = _session.page
            try:
                page.bring_to_front()
            except Exception:
                pass
            url = f"https://www.youtube.com/results?search_query={quote_plus(query)}"
            page.goto(url, wait_until="domcontentloaded")
            page.wait_for_selector("a#video-title", timeout=15000)
            handle = page.locator("ytd-video-renderer a#video-title").first
            handle.click()
            page.wait_for_url("**/watch?*", timeout=15000)
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_selector("video", timeout=15000)

            # Try to actually start playback instead of only opening the watch page.
            page.locator("video").evaluate(
                """(video) => {
                    if (!video) return false;
                    const p = video.play?.();
                    if (p && typeof p.catch === 'function') {
                        p.catch(() => {});
                    }
                    return !video.paused;
                }"""
            )
            page.wait_for_timeout(1200)
            is_playing = bool(
                page.locator("video").evaluate(
                    "(video) => !!video && !video.paused && !video.ended"
                )
            )
            title = page.title()
            return ToolResult(
                tool_name="browser_open_youtube_first_result",
                content=(
                    f"Opened first YouTube result for '{query}'. "
                    f"Title: {title}. Playing: {'yes' if is_playing else 'no'}"
                ),
                success=is_playing,
                metadata={
                    "query": query,
                    "title": title,
                    "url": page.url,
                    "playing": is_playing,
                },
            )

        try:
            return _open_first_result()
        except Exception as exc:
            if _is_recoverable_browser_error(exc):
                try:
                    _session.close()
                    return _open_first_result()
                except Exception as retry_exc:
                    exc = retry_exc
            return ToolResult(
                tool_name="browser_open_youtube_first_result",
                content=f"YouTube first-result error: {exc}",
                success=False,
            )


@ToolRegistry.register("browser_click")
class BrowserClickTool(BaseTool):
    """Click an element on the page."""

    tool_id = "browser_click"
    is_local = False

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="browser_click",
            description=(
                "Click an element on the current page."
                " Use a CSS selector or text content to identify the element."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector or text content of the element.",
                    },
                    "by_text": {
                        "type": "boolean",
                        "description": (
                            "If true, click by text content"
                            " instead of CSS selector. Default: false."
                        ),
                    },
                },
                "required": ["selector"],
            },
            category="browser",
        )

    def execute(self, **params: Any) -> ToolResult:
        selector = params.get("selector", "")
        if not selector:
            return ToolResult(
                tool_name="browser_click",
                content="No selector provided.",
                success=False,
            )

        by_text = params.get("by_text", False)

        try:
            page = _session.page
            if by_text:
                page.get_by_text(selector).click()
            else:
                page.click(selector)

            return ToolResult(
                tool_name="browser_click",
                content=f"Clicked element: {selector}",
                success=True,
                metadata={"selector": selector, "by_text": by_text},
            )
        except ImportError:
            return ToolResult(
                tool_name="browser_click",
                content=(
                    "playwright not installed. Install with: uv sync --extra browser"
                ),
                success=False,
            )
        except Exception as exc:
            return ToolResult(
                tool_name="browser_click",
                content=f"Click error: {exc}",
                success=False,
            )


# ---------------------------------------------------------------------------
# Tool 3: BrowserTypeTool
# ---------------------------------------------------------------------------


@ToolRegistry.register("browser_type")
class BrowserTypeTool(BaseTool):
    """Type text into a form field."""

    tool_id = "browser_type"
    is_local = False

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="browser_type",
            description=(
                "Type text into a form field on the current page."
                " Can clear the field first or append to existing content."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector of the input field.",
                    },
                    "text": {
                        "type": "string",
                        "description": "Text to type into the field.",
                    },
                    "clear": {
                        "type": "boolean",
                        "description": (
                            "If true, clear the field before typing. Default: true."
                        ),
                    },
                },
                "required": ["selector", "text"],
            },
            category="browser",
        )

    def execute(self, **params: Any) -> ToolResult:
        selector = params.get("selector", "")
        text = params.get("text", "")

        if not selector:
            return ToolResult(
                tool_name="browser_type",
                content="No selector provided.",
                success=False,
            )
        if not text:
            return ToolResult(
                tool_name="browser_type",
                content="No text provided.",
                success=False,
            )

        clear = params.get("clear", True)

        try:
            page = _session.page
            if clear:
                page.fill(selector, text)
            else:
                page.type(selector, text)

            return ToolResult(
                tool_name="browser_type",
                content=f"Typed text into: {selector}",
                success=True,
                metadata={"selector": selector},
            )
        except ImportError:
            return ToolResult(
                tool_name="browser_type",
                content=(
                    "playwright not installed. Install with: uv sync --extra browser"
                ),
                success=False,
            )
        except Exception as exc:
            return ToolResult(
                tool_name="browser_type",
                content=f"Type error: {exc}",
                success=False,
            )


# ---------------------------------------------------------------------------
# Tool 4: BrowserScreenshotTool
# ---------------------------------------------------------------------------


@ToolRegistry.register("browser_screenshot")
class BrowserScreenshotTool(BaseTool):
    """Take a screenshot of the current page."""

    tool_id = "browser_screenshot"
    is_local = False

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="browser_screenshot",
            description=(
                "Take a screenshot of the current browser page."
                " Returns the screenshot as base64-encoded data."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Optional file path to save the screenshot.",
                    },
                    "full_page": {
                        "type": "boolean",
                        "description": (
                            "If true, capture the full scrollable page. Default: false."
                        ),
                    },
                },
            },
            category="browser",
        )

    def execute(self, **params: Any) -> ToolResult:
        path = params.get("path")
        full_page = params.get("full_page", False)

        try:
            page = _session.page
            screenshot_bytes = page.screenshot(full_page=full_page)

            if path:
                with open(path, "wb") as f:
                    f.write(screenshot_bytes)

            b64_data = base64.b64encode(screenshot_bytes).decode("utf-8")

            description = "Screenshot taken"
            if full_page:
                description += " (full page)"
            if path:
                description += f", saved to {path}"

            return ToolResult(
                tool_name="browser_screenshot",
                content=description,
                success=True,
                metadata={"screenshot_base64": b64_data},
            )
        except ImportError:
            return ToolResult(
                tool_name="browser_screenshot",
                content=(
                    "playwright not installed. Install with: uv sync --extra browser"
                ),
                success=False,
            )
        except Exception as exc:
            return ToolResult(
                tool_name="browser_screenshot",
                content=f"Screenshot error: {exc}",
                success=False,
            )


# ---------------------------------------------------------------------------
# Tool 5: BrowserExtractTool
# ---------------------------------------------------------------------------


@ToolRegistry.register("browser_extract")
class BrowserExtractTool(BaseTool):
    """Extract content from the current page."""

    tool_id = "browser_extract"
    is_local = False

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="browser_extract",
            description=(
                "Extract content from the current browser page."
                " Supports extracting text, links, or tables."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": (
                            "CSS selector to extract from. Default: 'body'."
                        ),
                    },
                    "extract_type": {
                        "type": "string",
                        "description": (
                            "Type of extraction: 'text', 'links',"
                            " or 'tables'. Default: 'text'."
                        ),
                    },
                },
            },
            category="browser",
        )

    def execute(self, **params: Any) -> ToolResult:
        selector = params.get("selector", "body")
        extract_type = params.get("extract_type", "text")

        if extract_type not in ("text", "links", "tables"):
            return ToolResult(
                tool_name="browser_extract",
                content=(
                    f"Invalid extract_type: '{extract_type}'."
                    " Must be 'text', 'links', or 'tables'."
                ),
                success=False,
            )

        try:
            page = _session.page

            if extract_type == "text":
                content = page.inner_text(selector)
                if len(content) > 10000:
                    content = content[:10000] + "\n\n[Content truncated]"
                return ToolResult(
                    tool_name="browser_extract",
                    content=content,
                    success=True,
                    metadata={"selector": selector, "extract_type": extract_type},
                )

            elif extract_type == "links":
                links = page.eval_on_selector_all(
                    f"{selector} a[href]",
                    """elements => elements.map(el => ({
                        href: el.href,
                        text: el.innerText.trim()
                    }))""",
                )
                lines = []
                for link in links:
                    text = link.get("text", "")
                    href = link.get("href", "")
                    lines.append(f"- [{text}]({href})")
                content = "\n".join(lines) if lines else "No links found."
                if len(content) > 10000:
                    content = content[:10000] + "\n\n[Content truncated]"
                return ToolResult(
                    tool_name="browser_extract",
                    content=content,
                    success=True,
                    metadata={
                        "selector": selector,
                        "extract_type": extract_type,
                        "num_links": len(links),
                    },
                )

            else:  # tables
                tables_text = page.eval_on_selector_all(
                    f"{selector} table",
                    """elements => elements.map(el => el.innerText)""",
                )
                if tables_text:
                    content = "\n\n---\n\n".join(tables_text)
                else:
                    content = "No tables found."
                if len(content) > 10000:
                    content = content[:10000] + "\n\n[Content truncated]"
                return ToolResult(
                    tool_name="browser_extract",
                    content=content,
                    success=True,
                    metadata={
                        "selector": selector,
                        "extract_type": extract_type,
                        "num_tables": len(tables_text),
                    },
                )

        except ImportError:
            return ToolResult(
                tool_name="browser_extract",
                content=(
                    "playwright not installed. Install with: uv sync --extra browser"
                ),
                success=False,
            )
        except Exception as exc:
            return ToolResult(
                tool_name="browser_extract",
                content=f"Extract error: {exc}",
                success=False,
            )


__all__ = [
    "BrowserNavigateTool",
    "BrowserClickTool",
    "BrowserTypeTool",
    "BrowserScreenshotTool",
    "BrowserExtractTool",
]
