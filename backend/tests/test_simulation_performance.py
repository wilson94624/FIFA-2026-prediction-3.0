from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pytest

from backend import player_level_simulator as simulator
from backend.app.engine import GAMMA, MAX_GOALS, RHO, score_matrix

ROOT = Path(__file__).resolve().parents[2]


def _legacy_finished_search(games, stage, team_a, team_b):
    return next(
        (
            game
            for game in games
            if game.get("finished") == "TRUE"
            and game.get("type") == stage
            and (
                (
                    game.get("home_team_name_en") == team_a
                    and game.get("away_team_name_en") == team_b
                )
                or (
                    game.get("home_team_name_en") == team_b
                    and game.get("away_team_name_en") == team_a
                )
            )
        ),
        None,
    )


def _legacy_matchup_search(games, team_a, team_b):
    return next(
        (
            game
            for game in games
            if (
                game.get("home_team_name_en") == team_a
                and game.get("away_team_name_en") == team_b
            )
            or (
                game.get("home_team_name_en") == team_b
                and game.get("away_team_name_en") == team_a
            )
        ),
        None,
    )


def _legacy_poisson_pmf(k, rate):
    return rate**k * math.exp(-rate) / math.factorial(k)


def _legacy_score_matrix(home_rate, away_rate):
    shared = max(0.0, min(GAMMA, home_rate - 0.01, away_rate - 0.01))
    home_independent = home_rate - shared
    away_independent = away_rate - shared
    scores = []
    for home_goals in range(MAX_GOALS + 1):
        for away_goals in range(MAX_GOALS + 1):
            probability = 0.0
            for common in range(min(home_goals, away_goals) + 1):
                probability += (
                    _legacy_poisson_pmf(home_goals - common, home_independent)
                    * _legacy_poisson_pmf(away_goals - common, away_independent)
                    * _legacy_poisson_pmf(common, shared)
                )
            if home_goals == 0 and away_goals == 0:
                probability *= 1 - RHO * home_rate * away_rate
            elif home_goals == 1 and away_goals == 1:
                probability *= 1 - RHO
            elif home_goals == 1 and away_goals == 0:
                probability *= 1 + RHO * away_rate
            elif home_goals == 0 and away_goals == 1:
                probability *= 1 + RHO * home_rate
            scores.append(
                {"home": home_goals, "away": away_goals, "probability": max(0.0, probability)}
            )
    total = sum(float(score["probability"]) for score in scores) or 1.0
    for score in scores:
        score["probability"] = float(score["probability"]) / total
    return scores


def test_real_games_lookup_matches_legacy_first_match_search():
    games = [
        {
            "id": "first-pair",
            "type": "group",
            "home_team_name_en": "A",
            "away_team_name_en": "B",
            "finished": "FALSE",
            "stats": {"unavailable_players": {"home": [{"name": "A1"}], "away": []}},
        },
        {
            "id": "boolean-finished-is-not-legacy-finished",
            "type": "group",
            "home_team_name_en": "A",
            "away_team_name_en": "B",
            "finished": True,
        },
        {
            "id": "first-finished-group",
            "type": "group",
            "home_team_name_en": "B",
            "away_team_name_en": "A",
            "finished": "TRUE",
        },
        {
            "id": "later-finished-group",
            "type": "group",
            "home_team_name_en": "A",
            "away_team_name_en": "B",
            "finished": "TRUE",
        },
        {
            "id": "finished-r32",
            "type": "r32",
            "home_team_name_en": "A",
            "away_team_name_en": "B",
            "finished": "TRUE",
        },
    ]
    lookup = simulator.build_real_games_lookup(games)

    for stage in ("group", "r32", "final"):
        for team_a, team_b in (("A", "B"), ("B", "A")):
            expected = _legacy_finished_search(games, stage, team_a, team_b)
            actual = simulator._finished_real_game(lookup, stage, team_a, team_b)
            assert actual is expected

    for team_a, team_b in (("A", "B"), ("B", "A"), ("A", "C")):
        expected = _legacy_matchup_search(games, team_a, team_b)
        actual = simulator._matchup_real_game(lookup, team_a, team_b)
        assert actual is expected


@pytest.mark.parametrize(("home_rate", "away_rate"), [(1.4, 1.0), (0.2, 2.7), (3.1, 0.15)])
def test_score_matrix_pmf_cache_is_exactly_legacy_equivalent(home_rate, away_rate):
    assert score_matrix(home_rate, away_rate) == _legacy_score_matrix(home_rate, away_rate)


def test_active_pqs_cache_keeps_fatigue_application_outside_cached_values():
    teams = simulator.load_teams()
    team = next(team for team in teams.values() if team.get("has_data") and team.get("players"))
    unavailable = [team["players"][0]["name"]]
    cache = {}

    first = simulator.get_active_pqs(team, unavailable, 0.10, cache)
    second = simulator.get_active_pqs(team, unavailable, 0.25, cache)

    assert first == simulator.get_active_pqs(team, unavailable, 0.10)
    assert second == simulator.get_active_pqs(team, unavailable, 0.25)
    assert len(cache) == 1


def test_equal_normal_and_domination_rates_reuse_score_matrix(monkeypatch):
    teams = simulator.load_teams()
    candidates = [name for name, team in teams.items() if team.get("has_data")]
    team_a, team_b = next(
        (a, b)
        for index, a in enumerate(candidates)
        for b in candidates[index + 1 :]
        if abs(teams[a]["fifa_points"] - teams[b]["fifa_points"]) <= 250
    )
    calls = 0
    original = simulator.score_matrix

    def counted_score_matrix(home_rate, away_rate):
        nonlocal calls
        calls += 1
        return original(home_rate, away_rate)

    monkeypatch.setattr(simulator, "score_matrix", counted_score_matrix)
    simulator.play_match(team_a, team_b, teams, {}, [], real_games_lookup={
        "finished": {},
        "matchups": {},
    })

    assert calls == 1


def test_seeded_small_batch_simulation_matches_pre_optimization_results():
    games = json.loads((ROOT / "frontend/src/real_games_results.json").read_text())
    teams = simulator.apply_real_performance_boost(simulator.load_teams(), games)
    lookup = simulator.build_real_games_lookup(games)
    np.random.seed(20260621)

    results = [simulator.simulate_tournament_once(teams, games, lookup) for _ in range(20)]
    serialized = json.dumps(results, sort_keys=True, separators=(",", ":")).encode()

    assert hashlib.sha256(serialized).hexdigest() == (
        "6fdefc782fee3d06b66be0d3033bf91fbdf71a48d4ab14a4966a6848ed3bf676"
    )
