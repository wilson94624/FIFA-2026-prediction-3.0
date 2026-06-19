from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock

import httpx

from backend.app import fotmob, jobs, services


class FakeSession:
    def __init__(self, records=None):
        self.records = records or []
        self.added = []
        self.job = None

    def scalar(self, _query):
        return None

    def scalars(self, _query):
        return SimpleNamespace(all=lambda: self.records)

    def add(self, value):
        self.added.append(value)
        if isinstance(value, jobs.JobRecord):
            self.job = value

    def commit(self):
        return None

    def refresh(self, _value):
        return None


def test_fotmob_none_and_missing_payloads_are_safe():
    assert fotmob._stat_pairs({"content": None}) == {}
    assert fotmob._stat_pairs({"content": {"stats": None}}) == {}
    assert fotmob._parse_unavailable({}, "homeTeam") == []
    assert fotmob._parse_unavailable({"homeTeam": None}, "homeTeam") == []
    assert fotmob._event_summary({"content": {"matchFacts": None}}) == {
        "substitutions": [],
        "injury_events": [],
    }


def test_world_cup_connection_reset_uses_cache(monkeypatch):
    attempts = 0

    class ResettingClient:
        def __init__(self, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def get(self, *_args, **_kwargs):
            nonlocal attempts
            attempts += 1
            raise ConnectionResetError("peer reset")

    monkeypatch.setattr(services.httpx, "Client", ResettingClient)
    monkeypatch.setattr(services.time, "sleep", lambda _delay: None)
    session = FakeSession()
    progress = Mock()

    assert services.sync_remote_matches(session, progress) == 0
    assert attempts == 3
    progress.assert_any_call(35, "worldcup", "世界盃 API 暫時無法連線，沿用快取資料")


def test_fotmob_per_match_failure_does_not_stop_sync(monkeypatch):
    records = [
        SimpleNamespace(
            match_id="p0-one",
            payload={"id": "p0-one", "finished": True, "local_date": "2026-06-19"},
            source="seed",
            fetched_at=None,
            confidence=0.8,
        ),
        SimpleNamespace(
            match_id="p0-two",
            payload={"id": "p0-two", "finished": True, "local_date": "2026-06-19"},
            source="seed",
            fetched_at=None,
            confidence=0.8,
        ),
    ]
    responses = iter(
        [
            httpx.ReadError("peer reset"),
            {"fotmob_complete": True, "shotsA": 8, "shotsB": 5},
        ]
    )

    def fetch(_payload):
        result = next(responses)
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(services, "fetch_match_stats", fetch)
    session = FakeSession(records)

    assert services.refresh_fotmob_stats(session, Mock()) == 1
    assert "stats" not in records[0].payload
    assert records[1].payload["stats"]["fotmob_complete"] is True


def test_submit_failure_is_persisted_instead_of_queued(monkeypatch):
    session = FakeSession()
    monkeypatch.setattr(
        jobs.executor,
        "submit",
        Mock(side_effect=RuntimeError("executor unavailable")),
    )

    payload, reused = jobs.create_or_reuse_job(session, "sync")

    assert reused is False
    assert payload["status"] == "failed"
    assert payload["stage"] == "submit"
    assert "executor unavailable" in payload["error"]
