"""Where things land on disk must not depend on where the code sits.

Several locations were computed as ``Path(__file__).parents[4]``, which in a
development checkout resolved to the root of the drive (``E:\\His-projects``)
and, once installed as a wheel, to a directory inside the Python
installation.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from openeidon.core.paths import config_dir, projects_dir, safe_directory_name


class TestConfigDir:
    def test_defaults_under_the_user_home(self, monkeypatch):
        monkeypatch.delenv("OPENEIDON_HOME", raising=False)
        assert config_dir() == Path.home() / ".openeidon"

    def test_environment_override(self, monkeypatch, tmp_path):
        monkeypatch.setenv("OPENEIDON_HOME", str(tmp_path / "elsewhere"))
        assert config_dir() == tmp_path / "elsewhere"


class TestProjectsDir:
    def test_is_not_derived_from_the_source_location(self, monkeypatch):
        monkeypatch.delenv("EIDON_PROJECTS_DIR", raising=False)
        result = projects_dir()
        assert Path.home() in result.parents or result.parent == Path.home()
        assert result.name == "Eidon Projects"

    def test_environment_override(self, monkeypatch, tmp_path):
        monkeypatch.setenv("EIDON_PROJECTS_DIR", str(tmp_path / "proj"))
        assert projects_dir() == tmp_path / "proj"

    def test_never_lands_in_a_drive_root(self, monkeypatch):
        monkeypatch.delenv("EIDON_PROJECTS_DIR", raising=False)
        result = projects_dir()
        assert result.parent != result.anchor, f"{result} sits in the drive root"

    def test_both_users_of_the_path_agree(self, monkeypatch):
        monkeypatch.delenv("EIDON_PROJECTS_DIR", raising=False)
        from openeidon.server.routes import _projects_dir as from_routes
        from openeidon.tools.project_files_tool import _projects_dir as from_tool

        assert from_routes() == from_tool() == projects_dir()


class TestSafeDirectoryName:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("My Project", "My Project"),
            ("bad/name", "badname"),
            ('a<b>c:d"e|f?g*h', "abcdefgh"),
            ("trailing...", "trailing"),
            ("   ", "project"),
            ("", "project"),
        ],
    )
    def test_strips_what_a_filesystem_rejects(self, raw, expected):
        assert safe_directory_name(raw) == expected

    def test_cyrillic_survives(self):
        assert safe_directory_name("Мой проект") == "Мой проект"


class TestReminderStore:
    def test_reminders_live_in_the_config_dir(self, monkeypatch, tmp_path):
        monkeypatch.setenv("OPENEIDON_HOME", str(tmp_path))
        from openeidon.reminders.manager import _store_path

        path = _store_path()
        assert path.parent == tmp_path
        assert path.name == "reminders.json"
