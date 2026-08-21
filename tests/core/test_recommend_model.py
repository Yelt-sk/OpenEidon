"""Tests for hardware-aware model recommendation and model discovery.

``recommend_model()`` prefers what the engine already has installed and only
falls back to the tier table (a suggestion of what to pull) when the machine
has nothing. Every test here pins the discovery result explicitly so the
outcome does not depend on what the developer happens to have pulled.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from openeidon.core.config import (
    GpuInfo,
    HardwareInfo,
    _best_installed,
    _total_ram_gb,
    installed_models,
    recommend_model,
)


@pytest.fixture
def nothing_installed():
    """Force the "fresh machine" path so tier fallbacks are observable."""
    with patch("openeidon.core.config.installed_models", return_value=[]):
        yield


class TestInstalledModels:
    def test_returns_ids_from_engine(self):
        engine = MagicMock()
        engine.list_models.return_value = ["qwen3:4b", "granite4:tiny-h"]
        with (
            patch(
                "openeidon.core.registry.EngineRegistry.contains", return_value=True
            ),
            patch(
                "openeidon.core.registry.EngineRegistry.create", return_value=engine
            ),
        ):
            assert installed_models("ollama") == ["qwen3:4b", "granite4:tiny-h"]

    def test_unpacks_dict_entries(self):
        engine = MagicMock()
        engine.list_models.return_value = [{"id": "qwen3:4b"}, {"name": "mistral:7b"}]
        with (
            patch(
                "openeidon.core.registry.EngineRegistry.contains", return_value=True
            ),
            patch(
                "openeidon.core.registry.EngineRegistry.create", return_value=engine
            ),
        ):
            assert installed_models("ollama") == ["qwen3:4b", "mistral:7b"]

    def test_unknown_engine_is_empty(self):
        with patch(
            "openeidon.core.registry.EngineRegistry.contains", return_value=False
        ):
            assert installed_models("nope") == []

    def test_engine_failure_is_empty_not_an_error(self):
        engine = MagicMock()
        engine.list_models.side_effect = ConnectionError("ollama not running")
        with (
            patch(
                "openeidon.core.registry.EngineRegistry.contains", return_value=True
            ),
            patch(
                "openeidon.core.registry.EngineRegistry.create", return_value=engine
            ),
        ):
            assert installed_models("ollama") == []


class TestBestInstalled:
    def test_picks_largest_that_fits(self):
        models = ["qwen3:1.7b", "qwen3:4b", "qwen2.5:7b"]
        assert _best_installed(models, 32.0) == "qwen2.5:7b"

    def test_respects_the_memory_budget(self):
        models = ["qwen3:1.7b", "qwen3:4b", "qwen2.5:7b"]
        # 7b needs ~3.85 GB, 4b ~2.2 GB
        assert _best_installed(models, 3.0) == "qwen3:4b"
        assert _best_installed(models, 1.0) == "qwen3:1.7b"

    def test_sizes_models_missing_from_the_catalog_by_name(self):
        # Custom tags are not in the built-in catalog; the size comes from
        # the name so locally built models are still usable.
        assert _best_installed(["qwen3-4b-32k:latest"], 8.0) == "qwen3-4b-32k:latest"

    def test_skips_names_with_no_parseable_size(self):
        assert _best_installed(["granite-tiny-max:latest"], 64.0) == ""

    def test_nothing_fits(self):
        assert _best_installed(["qwen2.5:7b"], 0.5) == ""

    def test_empty_input(self):
        assert _best_installed([], 32.0) == ""


class TestRecommendModelPrefersInstalled:
    def test_installed_model_wins_over_the_tier_table(self):
        hw = HardwareInfo(platform="linux", ram_gb=32.0, gpu=None)
        with patch(
            "openeidon.core.config.installed_models",
            return_value=["qwen2.5:7b"],
        ):
            assert recommend_model(hw, "ollama") == "qwen2.5:7b"

    def test_falls_back_to_the_tier_table_when_nothing_is_installed(
        self, nothing_installed
    ):
        hw = HardwareInfo(platform="linux", ram_gb=16.0, gpu=None)
        assert recommend_model(hw, "llamacpp").startswith("qwen3:")

    def test_ignores_installed_models_that_do_not_fit(self):
        hw = HardwareInfo(
            platform="linux",
            ram_gb=16.0,
            gpu=GpuInfo(vendor="nvidia", name="GTX 1650", vram_gb=4.0, count=1),
        )
        with patch(
            "openeidon.core.config.installed_models",
            return_value=["qwen3:32b"],  # far too big for 3.6 GB
        ):
            # Falls through to the tier suggestion rather than proposing a
            # model that cannot load.
            assert recommend_model(hw, "ollama") != "qwen3:32b"


class TestRecommendModelTiers:
    """Tier table — only reached on a machine with no models yet."""

    @pytest.mark.parametrize(
        "ram_gb,expected",
        [
            (8.0, "qwen3:1.7b"),  # available = (8-4)*0.8 = 3.2 → ≤8 tier
            (16.0, "qwen3:4b"),  # available = 9.6 → ≤16 tier
            (32.0, "qwen3:8b"),  # available = 22.4 → ≤32 tier
            (64.0, "qwen3:14b"),  # available = 48 → ≤64 tier
        ],
    )
    def test_cpu_tiers(self, ram_gb, expected, nothing_installed):
        hw = HardwareInfo(platform="linux", ram_gb=ram_gb, gpu=None)
        assert recommend_model(hw, "llamacpp") == expected

    def test_gpu_memory_drives_the_choice(self, nothing_installed):
        hw = HardwareInfo(
            platform="linux",
            ram_gb=64.0,
            gpu=GpuInfo(vendor="nvidia", name="RTX 4090", vram_gb=24.0, count=1),
        )
        # available = 24 * 0.9 = 21.6 GB → ≤32 tier
        assert recommend_model(hw, "ollama") == "qwen3:8b"

    def test_small_gpu_gets_a_small_model(self, nothing_installed):
        hw = HardwareInfo(
            platform="linux",
            ram_gb=16.0,
            gpu=GpuInfo(vendor="nvidia", name="GTX 1650", vram_gb=4.0, count=1),
        )
        assert recommend_model(hw, "ollama") == "qwen3:1.7b"

    def test_recommendations_name_real_model_families(self, nothing_installed):
        """Guard against the regression that started this: the table used to
        name a 'qwen3.5' family that does not exist anywhere."""
        for ram in (8.0, 16.0, 32.0, 64.0, 256.0):
            hw = HardwareInfo(platform="linux", ram_gb=ram, gpu=None)
            result = recommend_model(hw, "llamacpp")
            assert "qwen3.5" not in result


class TestRecommendModelEdgeCases:
    def test_no_ram_no_gpu(self, nothing_installed):
        hw = HardwareInfo(platform="linux", ram_gb=0.0, gpu=None)
        assert recommend_model(hw, "ollama") == ""

    def test_very_low_ram_returns_empty(self, nothing_installed):
        hw = HardwareInfo(platform="linux", ram_gb=4.0, gpu=None)
        assert recommend_model(hw, "llamacpp") == ""


class TestTotalRamDetection:
    def test_detects_ram_on_this_machine(self):
        """RAM detection had no Windows branch, so it silently reported 0.0
        and the setup sized the machine off VRAM alone."""
        import platform as platform_mod

        ram = _total_ram_gb()
        if platform_mod.system() in ("Windows", "Linux", "Darwin"):
            assert ram > 0.0, "expected non-zero RAM on a supported platform"
