"""Piper TTS backend — local neural speech synthesis with Russian voices.

Piper (https://github.com/OHF-Voice/piper1-gpl) runs fully on-device and ships
Russian voices, which the other bundled backends do not cover well. Voices are
ONNX model files resolved in this order:

1. an explicit ``voice_id`` that is a path to a ``.onnx`` file
2. ``<voices_dir>/<voice_id>.onnx``
3. downloaded on demand into ``~/.openeidon/piper-voices/`` (needs network)

Install with: ``pip install piper-tts``
"""

from __future__ import annotations

import io
import logging
import wave
from pathlib import Path
from typing import Any, List, Optional

from openeidon.core.registry import TTSRegistry
from openeidon.speech.tts import TTSBackend, TTSResult

logger = logging.getLogger(__name__)

#: Bundled voice shortcuts. Russian first — that is the reason this backend exists.
KNOWN_VOICES: dict[str, str] = {
    "ru_RU-dmitri-medium": "ru",
    "ru_RU-denis-medium": "ru",
    "ru_RU-irina-medium": "ru",
    "ru_RU-ruslan-medium": "ru",
    "en_US-lessac-medium": "en",
    "en_US-amy-medium": "en",
}

DEFAULT_VOICE = "ru_RU-dmitri-medium"


def default_voices_dir() -> Path:
    return Path.home() / ".openeidon" / "piper-voices"


@TTSRegistry.register("piper")
class PiperTTSBackend(TTSBackend):
    """Local Piper synthesis; defaults to a Russian voice."""

    backend_id = "piper"

    def __init__(
        self,
        *,
        voices_dir: str = "",
        default_voice: str = DEFAULT_VOICE,
        download_missing: bool = True,
    ) -> None:
        self._voices_dir = Path(voices_dir) if voices_dir else default_voices_dir()
        self._default_voice = default_voice or DEFAULT_VOICE
        self._download_missing = download_missing
        self._loaded: dict[str, Any] = {}

    # ------------------------------------------------------------------
    # Voice resolution
    # ------------------------------------------------------------------

    def _voice_path(self, voice_id: str) -> Optional[Path]:
        """Locate the ONNX file for *voice_id* without downloading."""
        if voice_id.endswith(".onnx"):
            candidate = Path(voice_id).expanduser()
            return candidate if candidate.is_file() else None
        candidate = self._voices_dir / f"{voice_id}.onnx"
        return candidate if candidate.is_file() else None

    def _download_voice(self, voice_id: str) -> Path:
        """Fetch a voice into the voices dir using piper's downloader."""
        from piper.download_voices import download_voice

        self._voices_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Downloading Piper voice %s into %s", voice_id, self._voices_dir)
        download_voice(voice_id, self._voices_dir)
        path = self._voices_dir / f"{voice_id}.onnx"
        if not path.is_file():
            raise RuntimeError(f"Piper voice {voice_id} was not downloaded")
        return path

    def _load(self, voice_id: str):
        """Return a cached ``PiperVoice`` for *voice_id*."""
        if voice_id in self._loaded:
            return self._loaded[voice_id]
        try:
            from piper import PiperVoice
        except ImportError as exc:  # pragma: no cover — depends on env
            raise RuntimeError(
                "piper-tts is not installed. Install with: pip install piper-tts"
            ) from exc

        path = self._voice_path(voice_id)
        if path is None:
            if not self._download_missing:
                raise RuntimeError(
                    f"Piper voice '{voice_id}' not found in {self._voices_dir}"
                    " and downloads are disabled"
                )
            path = self._download_voice(voice_id)

        voice = PiperVoice.load(str(path))
        self._loaded[voice_id] = voice
        return voice

    # ------------------------------------------------------------------
    # TTSBackend interface
    # ------------------------------------------------------------------

    def synthesize(
        self,
        text: str,
        *,
        voice_id: str = "",
        speed: float = 1.0,
        output_format: str = "wav",
    ) -> TTSResult:
        if output_format.lower() != "wav":
            raise ValueError("Piper only produces WAV audio")
        chosen = voice_id or self._default_voice
        voice = self._load(chosen)

        # length_scale is inverse to speed: 2.0 is half speed.
        syn_config = None
        try:
            from piper import SynthesisConfig

            syn_config = SynthesisConfig(length_scale=1.0 / max(speed, 0.1))
        except ImportError:  # older piper builds take no config
            pass

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wav_file:
            if syn_config is not None:
                voice.synthesize_wav(text, wav_file, syn_config=syn_config)
            else:  # pragma: no cover — legacy piper
                voice.synthesize_wav(text, wav_file)

        buf.seek(0)
        audio = buf.read()
        sample_rate = getattr(getattr(voice, "config", None), "sample_rate", 22050)
        # 16-bit mono PCM plus a 44-byte header
        duration = max(len(audio) - 44, 0) / (2 * sample_rate) if sample_rate else 0.0
        return TTSResult(
            audio=audio,
            format="wav",
            voice_id=chosen,
            sample_rate=sample_rate,
            duration_seconds=duration,
            metadata={"backend": "piper", "language": KNOWN_VOICES.get(chosen, "")},
        )

    def available_voices(self) -> List[str]:
        """Installed voices first, then the known downloadable shortcuts."""
        installed = sorted(p.stem for p in self._voices_dir.glob("*.onnx"))
        extra = [v for v in KNOWN_VOICES if v not in installed]
        return installed + extra

    def health(self) -> bool:
        try:
            import piper  # noqa: F401
        except ImportError:
            return False
        if self._download_missing:
            return True
        return self._voice_path(self._default_voice) is not None
