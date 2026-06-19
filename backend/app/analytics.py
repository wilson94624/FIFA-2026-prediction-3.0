from __future__ import annotations

import math
from collections import defaultdict
from typing import Any

OUTCOMES = ("home", "draw", "away")


def actual_outcome(match: dict[str, Any]) -> str:
    home = int(match.get("home_score") or 0)
    away = int(match.get("away_score") or 0)
    return "home" if home > away else "away" if away > home else "draw"


def calculate_backtest(rows: list[tuple[dict[str, Any], dict[str, Any]]]) -> dict[str, Any]:
    if not rows:
        return {
            "sample_size": 0,
            "accuracy_1x2": None,
            "log_loss": None,
            "brier_score": None,
            "correct_score_top3_hit_rate": None,
            "calibration": [],
        }

    correct = 0
    log_loss = 0.0
    brier = 0.0
    score_hits = 0
    calibration: dict[int, list[int]] = defaultdict(list)

    for prediction, match in rows:
        probabilities = {
            key: float(prediction["model"]["probabilities"][key]) / 100 for key in OUTCOMES
        }
        actual = actual_outcome(match)
        predicted = max(probabilities, key=probabilities.get)
        is_correct = int(predicted == actual)
        correct += is_correct
        log_loss -= math.log(max(probabilities[actual], 1e-15))
        brier += sum(
            (probabilities[key] - (1.0 if key == actual else 0.0)) ** 2 for key in OUTCOMES
        )

        all_scores = sorted(
            prediction["model"]["score_matrix"],
            key=lambda score: float(score["probability"]),
            reverse=True,
        )[:3]
        actual_score = (int(match.get("home_score") or 0), int(match.get("away_score") or 0))
        score_hits += int(
            actual_score in {(int(score["home"]), int(score["away"])) for score in all_scores}
        )

        confidence = probabilities[predicted]
        bucket = min(9, int(confidence * 10))
        calibration[bucket].append(is_correct)

    size = len(rows)
    bins = []
    for bucket in range(10):
        observations = calibration.get(bucket, [])
        bins.append(
            {
                "range": f"{bucket * 10}-{(bucket + 1) * 10}%",
                "predicted_midpoint": bucket * 10 + 5,
                "actual_rate": round(sum(observations) / len(observations) * 100, 2)
                if observations
                else None,
                "count": len(observations),
            }
        )
    return {
        "sample_size": size,
        "accuracy_1x2": round(correct / size * 100, 2),
        "log_loss": round(log_loss / size, 5),
        "brier_score": round(brier / size, 5),
        "correct_score_top3_hit_rate": round(score_hits / size * 100, 2),
        "calibration": bins,
    }


def classify_failure(prediction: dict[str, Any], match: dict[str, Any]) -> tuple[str, list[str]]:
    actual = actual_outcome(match)
    probabilities = prediction["model"]["probabilities"]
    predicted = max(probabilities, key=probabilities.get)
    stats = match.get("stats") or {}
    reasons: list[str] = []

    expected_fields = ("xgA", "xgB", "cardsA", "cardsB", "substitutions")
    missing = [field for field in expected_fields if stats.get(field) is None]
    if predicted != actual and missing:
        reasons.append(f"缺少賽後欄位：{', '.join(missing)}")
        return "Missing Information", reasons

    market = prediction.get("market_evidence") or {}
    if market.get("available") and market.get("consensus"):
        model_actual = float(probabilities[actual])
        market_actual = float(market["consensus"][actual])
        if predicted != actual and market_actual - model_actual >= 10:
            reasons.append("市場對實際結果的支持比模型高至少 10 個百分點")
            return "Market Signal Missing", reasons

    if predicted != actual and stats.get("shotsA") is not None and stats.get("shotsB") is not None:
        shot_diff = int(stats["shotsA"]) - int(stats["shotsB"])
        expected_diff = (
            prediction["model"]["expected_goals"]["home"]
            - prediction["model"]["expected_goals"]["away"]
        )
        if shot_diff * expected_diff < 0:
            reasons.append("實際攻勢方向與模型預期相反")
            return "Style Mismatch", reasons

    if predicted != actual and max(float(value) for value in probabilities.values()) >= 70:
        reasons.append("高信心預測失準，需檢查 λ 與強弱參數偏誤")
        return "Parameter Bias", reasons

    reasons.append("實際結果仍位於模型保留的機率分布內")
    return "Random Football Variance", reasons


def deterministic_review(prediction: dict[str, Any], match: dict[str, Any]) -> dict[str, Any]:
    failure_type, reasons = classify_failure(prediction, match)
    predicted_score = prediction["model"]["predicted_score"]
    actual_score = f"{int(match.get('home_score') or 0)}-{int(match.get('away_score') or 0)}"
    summary = (
        f"模型預測 {predicted_score['home']}-{predicted_score['away']}，實際為 {actual_score}。"
        f"本場歸類為 {failure_type}；{reasons[0]}。"
    )
    return {
        "match_id": prediction["match_id"],
        "prediction": f"{predicted_score['home']}-{predicted_score['away']}",
        "actual_result": actual_score,
        "failure_type": failure_type,
        "confidence_level": prediction["model"]["confidence"],
        "reasons": reasons,
        "review": summary,
        "generated_by": "rules",
    }
