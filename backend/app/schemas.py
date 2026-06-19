from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class JobResponse(BaseModel):
    job_id: str
    job_type: Literal["sync", "simulation"]
    status: Literal["queued", "running", "completed", "failed"]
    progress: int
    stage: str
    message: str
    error: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    reused: bool = False


class HealthResponse(BaseModel):
    status: Literal["ok"]
    version: str
