from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pytest

from backend import player_level_simulator as simulator
from backend.app.bracket import resolve_match_teams
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


def _shortcut_team(group="A", fifa_points=1500):
    return {
        "group": group,
        "fifa_points": fifa_points,
        "has_data": False,
        "starting_pqs": 0.5,
        "bench_pqs": 0.2,
    }


def test_finished_shortcut_matches_legacy_score_winner_and_fatigue_semantics():
    teams = {"A": _shortcut_team(), "B": _shortcut_team()}
    games = [
        {
            "type": "group",
            "home_team_name_en": "A",
            "away_team_name_en": "B",
            "home_score": "2",
            "away_score": "1",
            "finished": "TRUE",
        },
        {
            "type": "r32",
            "home_team_name_en": "A",
            "away_team_name_en": "B",
            "home_score": "1",
            "away_score": "1",
            "finished": "TRUE",
        },
    ]
    shortcuts = simulator.build_finished_match_shortcuts(
        simulator.build_real_games_lookup(games), teams
    )
    group_fatigue = {}
    knockout_fatigue = {}

    assert simulator.apply_finished_match_shortcut(
        shortcuts, "group", "B", "A", group_fatigue
    ) == ("A", 1, 2)
    assert simulator.apply_finished_match_shortcut(
        shortcuts, "r32", "B", "A", knockout_fatigue, is_knockout=True
    ) == ("B", 1, 1)
    assert group_fatigue == {"A": pytest.approx(0.032), "B": pytest.approx(0.032)}
    assert knockout_fatigue == {"A": pytest.approx(0.032), "B": pytest.approx(0.032)}


def test_finished_group_shortcuts_update_complete_standings_without_play_match(monkeypatch):
    teams = {}
    games = []
    match_id = 1
    for group in "ABCDEFGHIJKL":
        names = [f"{group}{index}" for index in range(1, 5)]
        for index, name in enumerate(names):
            teams[name] = _shortcut_team(group, 1600 - index)
        for home_index in range(4):
            for away_index in range(home_index + 1, 4):
                games.append(
                    {
                        "id": str(match_id),
                        "type": "group",
                        "home_team_name_en": names[home_index],
                        "away_team_name_en": names[away_index],
                        "home_score": "1",
                        "away_score": "0",
                        "finished": "TRUE",
                    }
                )
                match_id += 1
    lookup = simulator.build_real_games_lookup(games)
    shortcuts = simulator.build_finished_match_shortcuts(lookup, teams)
    monkeypatch.setattr(
        simulator,
        "play_match",
        lambda *_args, **_kwargs: pytest.fail("finished group match entered play_match"),
    )

    standings, _ = simulator.simulate_group_stage(
        teams, {}, games, lookup, {}, shortcuts
    )

    assert [row["points"] for row in standings["A"]] == [9, 6, 3, 0]
    assert [(row["gs"], row["gd"]) for row in standings["A"]] == [
        (3, 3),
        (2, 1),
        (1, -1),
        (0, -3),
    ]


def test_finished_knockout_shortcut_winner_feeds_next_match_resolver():
    teams = {name: _shortcut_team() for name in ("A", "B", "C")}
    finished = {
        "id": "73",
        "type": "r32",
        "home_team_name_en": "A",
        "away_team_name_en": "B",
        "home_score": "2",
        "away_score": "1",
        "finished": "TRUE",
    }
    next_match = {
        "id": "89",
        "type": "r16",
        "home_team_label": "Winner Match 73",
        "away_team_name_en": "C",
    }
    lookup = simulator.build_real_games_lookup([finished, next_match])
    shortcuts = simulator.build_finished_match_shortcuts(lookup, teams)
    result = simulator.apply_finished_match_shortcut(
        shortcuts, "r32", "A", "B", {}, is_knockout=True
    )
    winners = {"73": result[0]}

    assert resolve_match_teams(next_match, {}, {}, winners) == ("A", "C")


def test_group_result_accumulator_updates_played_counts():
    standings = {
        name: {"points": 0, "gs": 0, "gd": 0}
        for name in ("A", "B")
    }
    played_counts = {"A": 0, "B": 0}

    simulator._record_group_match_result(
        standings, played_counts, "A", "B", "A", 3, 1
    )

    assert played_counts == {"A": 1, "B": 1}
    assert standings == {
        "A": {"points": 3, "gs": 3, "gd": 2},
        "B": {"points": 0, "gs": 1, "gd": -2},
    }


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


def test_equal_normal_and_domination_rates_reuse_score_probabilities(monkeypatch):
    teams = simulator.load_teams()
    candidates = [name for name, team in teams.items() if team.get("has_data")]
    team_a, team_b = next(
        (a, b)
        for index, a in enumerate(candidates)
        for b in candidates[index + 1 :]
        if abs(teams[a]["fifa_points"] - teams[b]["fifa_points"]) <= 250
    )
    calls = 0
    original = simulator.score_probabilities

    def counted_score_probabilities(home_rate, away_rate):
        nonlocal calls
        calls += 1
        return original(home_rate, away_rate)

    monkeypatch.setattr(simulator, "score_probabilities", counted_score_probabilities)
    simulator.play_match(team_a, team_b, teams, {}, [], real_games_lookup={
        "finished": {},
        "matchups": {},
    })

    assert calls == 1


def test_seeded_small_batch_simulation_matches_pre_optimization_results():
    games = json.loads((ROOT / "frontend/src/real_games_results.json").read_text())
    teams = simulator.apply_real_performance_boost(simulator.load_teams(), games)
    lookup = simulator.build_real_games_lookup(games)
    shortcuts = simulator.build_finished_match_shortcuts(lookup, teams)
    active_pqs_cache = {}
    np.random.seed(20260621)

    results = [
        simulator.simulate_tournament_once(
            teams, games, lookup, shortcuts, active_pqs_cache
        )
        for _ in range(20)
    ]
    np.random.seed(20260621)
    pre_shortcut_results = [
        simulator.simulate_tournament_once(teams, games, lookup, None)
        for _ in range(20)
    ]
    serialized = json.dumps(results, sort_keys=True, separators=(",", ":")).encode()

    assert results == pre_shortcut_results
    assert active_pqs_cache
    assert hashlib.sha256(serialized).hexdigest() == (
        "6fdefc782fee3d06b66be0d3033bf91fbdf71a48d4ab14a4966a6848ed3bf676"
    )
