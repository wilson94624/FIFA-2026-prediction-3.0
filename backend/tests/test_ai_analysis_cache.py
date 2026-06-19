from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.app import services
from backend.app.db import Base
from backend.app.models import MatchRecord, PredictionRecord


def _analysis(updated_at, *, model=None, market=None):
    return {
        "summary": "cached",
        "generated_by": "gemini_pre_match",
        "updated_at": updated_at.isoformat(),
        "model_probabilities": model or {"home": 50, "draw": 25, "away": 25},
        "market_consensus": market or {"home": 48, "draw": 27, "away": 25},
    }


def _prediction(analysis=None, *, model=None, market=None):
    return {
        "model": {
            "probabilities": model or {"home": 50, "draw": 25, "away": 25},
            "upset_risk": {"factors": []},
        },
        "market_evidence": {
            "available": True,
            "consensus": market or {"home": 48, "draw": 27, "away": 25},
        },
        "risk_analysis": analysis or {"summary": "rules", "generated_by": "rules"},
    }


def _add_case(session, match_id, kickoff, prediction):
    session.add(
        MatchRecord(
            match_id=match_id,
            payload={
                "id": match_id,
                "type": "group",
                "local_date": kickoff.strftime("%m/%d/%Y %H:%M"),
                "finished": "FALSE",
            },
        )
    )
    session.add(
        PredictionRecord(
            match_id=match_id,
            input_version="test",
            payload=prediction,
        )
    )


def test_candidate_selection_uses_refresh_rules_and_priority():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    current = datetime(2026, 6, 20, 12, tzinfo=UTC)
    with Session(engine) as session:
        _add_case(session, "missing", current + timedelta(days=4), _prediction())
        _add_case(
            session,
            "near-stale",
            current + timedelta(hours=30),
            _prediction(_analysis(current - timedelta(hours=25))),
        )
        _add_case(
            session,
            "model-change",
            current + timedelta(days=10),
            _prediction(
                _analysis(current - timedelta(hours=1)),
                model={"home": 56, "draw": 22, "away": 22},
            ),
        )
        _add_case(
            session,
            "market-change",
            current + timedelta(days=8),
            _prediction(
                _analysis(current - timedelta(hours=1)),
                market={"home": 54, "draw": 23, "away": 23},
            ),
        )
        _add_case(
            session,
            "fresh-unchanged",
            current + timedelta(days=3),
            _prediction(_analysis(current - timedelta(hours=1))),
        )
        session.commit()

        candidates = services.select_prematch_analysis_candidates(
            session, current_time=current
        )

    assert [match.match_id for match, _ in candidates] == [
        "missing",
        "near-stale",
        "market-change",
        "model-change",
    ]


def test_candidate_selection_caps_each_sync_at_ten():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    current = datetime(2026, 6, 20, 12, tzinfo=UTC)
    with Session(engine) as session:
        for index in range(12):
            _add_case(
                session,
                f"missing-{index:02d}",
                current + timedelta(hours=index + 1),
                _prediction(),
            )
        session.commit()

        candidates = services.select_prematch_analysis_candidates(
            session, current_time=current
        )

    assert len(candidates) == 10
    assert candidates[0][0].match_id == "missing-00"


def test_gemini_failure_keeps_cache_and_does_not_fail_sync_step(monkeypatch, caplog):
    match = SimpleNamespace(match_id="73", payload={"id": "73"})
    prediction = SimpleNamespace(
        payload=_prediction(_analysis(datetime(2026, 6, 19, tzinfo=UTC))),
        source="predictor_engine",
    )

    class FakeSession:
        def commit(self):
            raise AssertionError("failed generation must not write")

    monkeypatch.setattr(
        services,
        "settings",
        SimpleNamespace(gemini_api_key="test-key"),
    )
    monkeypatch.setattr(
        services,
        "select_prematch_analysis_candidates",
        lambda _session, limit: [(match, prediction)],
    )
    monkeypatch.setattr(
        services,
        "_gemini_prematch_analysis",
        lambda *_args: (_ for _ in ()).throw(RuntimeError("temporary Gemini failure")),
    )

    updated = services.refresh_prematch_ai_analyses(FakeSession(), lambda *_args: None)

    assert updated == 0
    assert prediction.payload["risk_analysis"]["summary"] == "cached"
    assert "keeping cached analysis" in caplog.text
