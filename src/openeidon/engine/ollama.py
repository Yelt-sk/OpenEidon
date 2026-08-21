"""Ollama inference engine backend."""

from __future__ import annotations

import json
import logging
import os
import time
from collections.abc import AsyncIterator, Sequence
from typing import Any, Dict, List

import httpx

from openeidon.core.registry import EngineRegistry
from openeidon.core.types import Message
from openeidon.engine._base import (
    EngineConnectionError,
    InferenceEngine,
    estimate_prompt_tokens,
    messages_to_dicts,
)

logger = logging.getLogger(__name__)
_RETRYABLE_STATUS_CODES = {502, 503, 504}


def default_num_ctx() -> int:
    """Context window sized to the machine, not a fixed constant.

    The KV cache scales with this value, so a window the card cannot hold
    pushes layers onto the CPU: on a 4 GB GPU a 4B model measured 8.9 s per
    routing call at 8192 and 1.0 s at 4096. Overridable per engine via
    config, or with EIDON_NUM_CTX.
    """
    override = os.environ.get("EIDON_NUM_CTX", "").strip()
    if override.isdigit() and int(override) > 0:
        return int(override)

    try:
        from openeidon.core.config import detect_hardware

        hw = detect_hardware()
        gpu = getattr(hw, "gpu", None)
        vram_gb = (getattr(gpu, "vram_gb", 0.0) or 0.0) * max(
            getattr(gpu, "count", 1) or 1, 1
        )
    except Exception:  # hardware detection is best-effort
        return 4096

    if vram_gb <= 0:
        # CPU inference: RAM is plentiful compared to VRAM, so keep the
        # larger window.
        return 8192
    if vram_gb < 6:
        return 4096
    if vram_gb < 12:
        return 8192
    return 16384


@EngineRegistry.register("ollama")
class OllamaEngine(InferenceEngine):
    """Ollama backend via its native HTTP API."""

    engine_id = "ollama"

    _DEFAULT_HOST = "http://localhost:11434"

    def __init__(
        self,
        host: str | None = None,
        *,
        timeout: float = 1800.0,
        num_ctx: int | None = None,
    ) -> None:
        # Priority: explicit host (from config.toml) > OLLAMA_HOST env var > default
        if host is None:
            env_host = os.environ.get("OLLAMA_HOST")
            host = env_host or self._DEFAULT_HOST
        self._host = host.rstrip("/")
        self._client = httpx.Client(base_url=self._host, timeout=timeout)
        # Last stream usage — captured from Ollama's final chunk
        self._last_stream_usage: Dict[str, int] = {}
        self._num_ctx = num_ctx if num_ctx else default_num_ctx()

    def generate(
        self,
        messages: Sequence[Message],
        *,
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        msg_dicts = messages_to_dicts(messages)
        # Ollama expects tool_call arguments as dicts, not JSON strings
        for md in msg_dicts:
            for tc in md.get("tool_calls", []):
                fn = tc.get("function", {})
                args = fn.get("arguments")
                if isinstance(args, str):
                    try:
                        fn["arguments"] = json.loads(args)
                    except (json.JSONDecodeError, TypeError):
                        pass
        payload: Dict[str, Any] = {
            "model": model,
            "messages": msg_dicts,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "num_ctx": kwargs.get("num_ctx") or self._num_ctx,
            },
        }
        # Disable extended thinking by default (Qwen3.5 etc.).
        # When enabled, thinking tokens consume the entire budget and
        # the visible content comes back empty.
        if "think" not in kwargs:
            payload["think"] = False
        elif kwargs["think"] is not None:
            payload["think"] = kwargs["think"]
        # Pass tools if provided
        tools = kwargs.get("tools")
        if tools:
            payload["tools"] = tools

        # Apply structured output / JSON mode
        response_format = kwargs.get("response_format")
        if response_format is not None:
            from openeidon.engine._stubs import ResponseFormat

            if isinstance(response_format, ResponseFormat):
                payload["format"] = "json"
            elif isinstance(response_format, dict):
                payload["format"] = "json"
        last_http_error: httpx.HTTPStatusError | None = None
        for attempt in range(3):
            try:
                resp = self._client.post("/api/chat", json=payload)
                if resp.status_code == 400 and tools:
                    # Model may not support function calling -- retry without tools
                    payload.pop("tools", None)
                    resp = self._client.post("/api/chat", json=payload)
                resp.raise_for_status()
                break
            except (httpx.ConnectError, httpx.TimeoutException) as exc:
                raise EngineConnectionError(
                    f"Ollama not reachable at {self._host}"
                ) from exc
            except httpx.HTTPStatusError as exc:
                last_http_error = exc
                if exc.response is not None and exc.response.status_code in _RETRYABLE_STATUS_CODES and attempt < 2:
                    time.sleep(attempt + 1)
                    continue
                body = exc.response.text[:500] if exc.response else ""
                raise RuntimeError(
                    f"Ollama returned {exc.response.status_code}: {body}"
                ) from exc
        else:
            body = last_http_error.response.text[:500] if last_http_error and last_http_error.response else ""
            code = last_http_error.response.status_code if last_http_error and last_http_error.response else "unknown"
            raise RuntimeError(f"Ollama returned {code}: {body}")
        data = resp.json()
        # prompt_eval_count = tokens actually evaluated (KV-cache-aware).
        # estimate_prompt_tokens = full prompt size (for cost comparison).
        # We report both so downstream can use the right one:
        #   prompt_tokens        → full size (what cloud would charge)
        #   prompt_tokens_evaluated → actual compute (with KV cache)
        reported_prompt = data.get("prompt_eval_count", 0)
        estimated_prompt = estimate_prompt_tokens(messages)
        prompt_tokens = max(reported_prompt, estimated_prompt)
        prompt_tokens_evaluated = (
            reported_prompt if reported_prompt > 0 else prompt_tokens
        )
        completion_tokens = data.get("eval_count", 0)
        content = data.get("message", {}).get("content", "")
        result: Dict[str, Any] = {
            "content": content,
            "usage": {
                "prompt_tokens": prompt_tokens,
                "prompt_tokens_evaluated": prompt_tokens_evaluated,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
            "model": data.get("model", model),
            "finish_reason": "stop",
        }
        # Extract timing from Ollama response (nanoseconds → seconds)
        result["ttft"] = data.get("prompt_eval_duration", 0) / 1e9
        result["engine_timing"] = {
            k: data[k]
            for k in (
                "total_duration",
                "load_duration",
                "prompt_eval_duration",
                "eval_duration",
            )
            if k in data
        }
        # Extract tool calls if present
        raw_tool_calls = data.get("message", {}).get("tool_calls", [])
        if raw_tool_calls:
            tool_calls = []
            for i, tc in enumerate(raw_tool_calls):
                raw_args = tc.get("function", {}).get(
                    "arguments",
                    "{}",
                )
                tool_calls.append(
                    {
                        "id": tc.get("id", f"call_{i}"),
                        "name": tc.get("function", {}).get("name", ""),
                        "arguments": (
                            json.dumps(raw_args)
                            if isinstance(raw_args, dict)
                            else raw_args
                        ),
                    }
                )
            result["tool_calls"] = tool_calls
        return result

    async def stream(
        self,
        messages: Sequence[Message],
        *,
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages_to_dicts(messages),
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "num_ctx": kwargs.get("num_ctx") or self._num_ctx,
            },
        }
        last_http_error: httpx.HTTPStatusError | None = None
        for attempt in range(3):
            try:
                with self._client.stream("POST", "/api/chat", json=payload) as resp:
                    resp.raise_for_status()
                    for line in resp.iter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        content = chunk.get("message", {}).get("content", "")
                        if content:
                            yield content
                        if chunk.get("done", False):
                            reported_prompt = chunk.get("prompt_eval_count", 0)
                            est_prompt = estimate_prompt_tokens(messages)
                            full_prompt = max(reported_prompt, est_prompt)
                            evaluated = (
                                reported_prompt if reported_prompt > 0 else full_prompt
                            )
                            comp = chunk.get("eval_count", 0)
                            self._last_stream_usage = {
                                "prompt_tokens": full_prompt,
                                "prompt_tokens_evaluated": evaluated,
                                "completion_tokens": comp,
                                "total_tokens": full_prompt + comp,
                            }
                            return
                return
            except (httpx.ConnectError, httpx.TimeoutException) as exc:
                raise EngineConnectionError(
                    f"Ollama not reachable at {self._host}"
                ) from exc
            except httpx.HTTPStatusError as exc:
                last_http_error = exc
                if exc.response is not None and exc.response.status_code in _RETRYABLE_STATUS_CODES and attempt < 2:
                    time.sleep(attempt + 1)
                    continue
                raise
        if last_http_error:
            raise last_http_error

    def list_models(self) -> List[str]:
        try:
            resp = self._client.get("/api/tags")
            resp.raise_for_status()
        except (
            httpx.ConnectError,
            httpx.TimeoutException,
            httpx.HTTPStatusError,
        ) as exc:
            logger.warning(
                "Failed to list models from Ollama at %s: %s",
                self._host,
                exc,
            )
            return []
        data = resp.json()
        return [m["name"] for m in data.get("models", [])]

    def list_models_detailed(self) -> List[Dict[str, Any]]:
        """Model ids with on-disk size and quantization from ``/api/tags``."""
        try:
            resp = self._client.get("/api/tags")
            resp.raise_for_status()
        except (
            httpx.ConnectError,
            httpx.TimeoutException,
            httpx.HTTPStatusError,
        ) as exc:
            logger.warning(
                "Failed to list models from Ollama at %s: %s", self._host, exc
            )
            return []

        detailed: List[Dict[str, Any]] = []
        for entry in resp.json().get("models", []):
            details = entry.get("details") or {}
            detailed.append(
                {
                    "id": entry.get("name", ""),
                    "size_bytes": entry.get("size"),
                    "parameter_size": details.get("parameter_size", ""),
                    "quantization": details.get("quantization_level", ""),
                }
            )
        return [m for m in detailed if m["id"]]

    def health(self) -> bool:
        try:
            resp = self._client.get("/api/tags", timeout=2.0)
            return resp.status_code == 200
        except Exception as exc:
            logger.debug("Ollama health check failed at %s: %s", self._host, exc)
            return False

    def close(self) -> None:
        self._client.close()


__all__ = ["OllamaEngine"]
