"""Tests for LoRATrainer — LoRA/QLoRA fine-tuning from trace-derived SFT pairs."""

from __future__ import annotations

import pytest

from openjarvis.learning.training.lora import HAS_TORCH, LoRATrainer, LoRATrainingConfig

# ---------------------------------------------------------------------------
# Config tests (no torch required)
# ---------------------------------------------------------------------------


class TestLoRATrainingConfig:
    def test_default_config(self) -> None:
        """Verify default values of LoRATrainingConfig."""
        cfg = LoRATrainingConfig()

        # LoRA params
        assert cfg.lora_rank == 16
        assert cfg.lora_alpha == 32
        assert cfg.lora_dropout == 0.05
        assert cfg.target_modules == ["q_proj", "v_proj"]

        # Training params
        assert cfg.num_epochs == 3
        assert cfg.batch_size == 4
        assert cfg.learning_rate == 2e-5
        assert cfg.weight_decay == 0.01
        assert cfg.warmup_ratio == 0.1
        assert cfg.max_grad_norm == 1.0
        assert cfg.max_seq_length == 2048

        # QLoRA
        assert cfg.use_4bit is False

        # Output
        assert cfg.output_dir == "checkpoints/lora"
        assert cfg.save_every_n_epochs == 1

        # Memory
        assert cfg.gradient_checkpointing is True

    def test_custom_config(self) -> None:
        """Verify custom values are stored correctly."""
        cfg = LoRATrainingConfig(
            lora_rank=8,
            lora_alpha=16,
            lora_dropout=0.1,
            target_modules=["q_proj", "k_proj", "v_proj"],
            num_epochs=5,
            batch_size=8,
            learning_rate=1e-4,
            weight_decay=0.05,
            warmup_ratio=0.2,
            max_grad_norm=0.5,
            max_seq_length=4096,
            use_4bit=True,
            output_dir="/tmp/lora_test",
            save_every_n_epochs=2,
            gradient_checkpointing=False,
        )

        assert cfg.lora_rank == 8
        assert cfg.lora_alpha == 16
        assert cfg.lora_dropout == 0.1
        assert cfg.target_modules == ["q_proj", "k_proj", "v_proj"]
        assert cfg.num_epochs == 5
        assert cfg.batch_size == 8
        assert cfg.learning_rate == 1e-4
        assert cfg.weight_decay == 0.05
        assert cfg.warmup_ratio == 0.2
        assert cfg.max_grad_norm == 0.5
        assert cfg.max_seq_length == 4096
        assert cfg.use_4bit is True
        assert cfg.output_dir == "/tmp/lora_test"
        assert cfg.save_every_n_epochs == 2
        assert cfg.gradient_checkpointing is False

    def test_config_validates_lora_rank(self) -> None:
        """lora_rank=0 raises ValueError."""
        with pytest.raises(ValueError, match="lora_rank"):
            LoRATrainingConfig(lora_rank=0)

    def test_config_validates_num_epochs(self) -> None:
        """num_epochs=0 raises ValueError."""
        with pytest.raises(ValueError, match="num_epochs"):
            LoRATrainingConfig(num_epochs=0)


# ---------------------------------------------------------------------------
# Trainer tests (require torch)
# ---------------------------------------------------------------------------


class TestLoRATrainerNoTorch:
    def test_init_without_torch_raises(self) -> None:
        """If HAS_TORCH is False, constructing LoRATrainer raises ImportError."""
        if HAS_TORCH:
            pytest.skip("torch is installed; cannot test missing-torch path")

        cfg = LoRATrainingConfig()
        with pytest.raises(ImportError, match="torch"):
            LoRATrainer(cfg)


@pytest.mark.skipif(not HAS_TORCH, reason="torch not installed")
class TestLoRATrainerWithTorch:
    def test_prepare_dataset_from_pairs(self) -> None:
        """prepare_dataset converts SFT pairs to tokenized examples."""
        cfg = LoRATrainingConfig()
        trainer = LoRATrainer(cfg, model_name="Qwen/Qwen3-0.6B")

        pairs = [
            {
                "input": "What is 2+2?",
                "output": "4",
                "query_class": "math",
                "model": "qwen3:8b",
                "feedback": 0.9,
            },
            {
                "input": "Write hello world in Python",
                "output": "print('hello world')",
                "query_class": "code",
                "model": "qwen3:8b",
                "feedback": 0.85,
            },
        ]

        dataset = trainer.prepare_dataset(pairs)

        assert len(dataset) == 2
        for item in dataset:
            assert "input_ids" in item
            assert "attention_mask" in item
            assert "text" in item

    def test_train_empty_pairs_returns_skipped(self) -> None:
        """train() with empty pairs returns skipped status."""
        cfg = LoRATrainingConfig()
        trainer = LoRATrainer(cfg, model_name="Qwen/Qwen3-0.6B")

        result = trainer.train([])

        assert result["status"] == "skipped"
        assert "reason" in result
