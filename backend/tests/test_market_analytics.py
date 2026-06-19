import pytest

from backend.app.analytics import calculate_backtest, deterministic_review
from backend.app.market import consensus_from_bookmakers, devig_decimal_prices


def test_devig_and_consensus_median():
    devigged = devig_decimal_prices({"home": 2.0, "draw": 3.5, "away": 4.0})
    assert sum(devigged.values()) == pytest.approx(1.0)
    event = {
        "bookmakers": [
            {
                "last_update": "2026-06-19T08:00:00Z",
                "markets": [
                    {
                        "key": "h2h",
                        "outcomes": [
                            {"name": "France", "price": 1.8},
                            {"name": "Draw", "price": 3.5},
                            {"name": "Senegal", "price": 5.0},
                        ],
                    }
                ],
            }
        ]
    }
    consensus, count, updated = consensus_from_bookmakers(event, "France", "Senegal")
    assert count == 1
    assert updated is not None
    assert sum(consensus.values()) == pytest.approx(1.0)


def test_backtest_metrics_and_calibration():
    prediction = {
        "model": {
            "probabilities": {"home": 60, "draw": 25, "away": 15},
            "score_matrix": [
                {"home": 1, "away": 0, "probability": 20},
                {"home": 2, "away": 0, "probability": 15},
                {"home": 1, "away": 1, "probability": 12},
            ],
        }
    }
    match = {"home_score": "1", "away_score": "0"}
    result = calculate_backtest([(prediction, match)])
    assert result["accuracy_1x2"] == 100
    assert result["correct_score_top3_hit_rate"] == 100
    assert sum(bucket["count"] for bucket in result["calibration"]) == 1


def test_review_never_mutates_prediction():
    prediction = {
        "match_id": "1",
        "model": {
            "probabilities": {"home": 72, "draw": 18, "away": 10},
            "predicted_score": {"home": 2, "away": 0},
            "expected_goals": {"home": 2.1, "away": 0.7},
            "confidence": "High",
        },
        "market_evidence": {"available": False},
    }
    before = repr(prediction)
    match = {"home_score": "0", "away_score": "1", "stats": {}}
    review = deterministic_review(prediction, match)
    assert review["failure_type"] == "Missing Information"
    assert repr(prediction) == before
