from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.main import app


def test_health_and_prediction_contract():
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["version"] == "4.0.0"

        tournament = client.get("/api/tournament")
        assert tournament.status_code == 200
        match = next(
            item
            for item in tournament.json()["matches"]
            if item.get("home_team_name_en")
            and item.get("away_team_name_en")
            and item.get("home_team_name_en") in tournament.json()["teams"]
            and item.get("away_team_name_en") in tournament.json()["teams"]
        )
        assert {"kickoff_utc", "kickoff_status", "kickoff_source"}.issubset(match)
        response = client.get(f"/api/predictions/{match['id']}")
        assert response.status_code == 200
        payload = response.json()
        assert {"kickoff_utc", "kickoff_status", "kickoff_source"}.issubset(payload)
        assert set(payload["model"]["probabilities"]) == {"home", "draw", "away"}
        assert len(payload["model"]["score_matrix"]) == 36


def test_background_job_returns_immediately_and_reuses_active_job():
    with TestClient(app) as client, patch("backend.app.jobs.executor.submit"):
        first = client.post("/api/sync")
        second = client.post("/api/sync")
        assert first.status_code == 202
        assert second.status_code == 202
        assert first.json()["job_id"] == second.json()["job_id"]
        assert second.json()["reused"] is True


def test_simulation_endpoint_returns_completed_snapshot_reuse():
    completed = {
        "job_id": "snapshot-job",
        "job_type": "simulation",
        "status": "completed",
        "progress": 100,
        "stage": "snapshot_reused",
        "message": "snapshot reused",
        "error": None,
        "created_at": None,
        "updated_at": None,
    }
    with TestClient(app) as client, patch(
        "backend.app.main.create_or_reuse_job", return_value=(completed, True)
    ):
        response = client.post("/api/simulations")

    assert response.status_code == 202
    assert response.headers["X-Job-Reused"] == "true"
    assert response.json()["reused"] is True
    assert response.json()["status"] == "completed"
