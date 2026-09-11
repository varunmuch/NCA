from typing import List, Optional

from pydantic import BaseModel, Field


class ProgressTaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    notes: str = ""
    status: str = "not_started"
    priority: str = "medium"
    due_date: Optional[str] = None
    sort_order: int = 0


class ProgressTaskUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    sort_order: Optional[int] = None


class ProgressTaskResponse(BaseModel):
    id: int
    timeline_id: int
    student_id: str
    title: str
    notes: str
    status: str
    priority: str
    due_date: Optional[str] = None
    sort_order: int
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ProgressTimelineCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str = "not_started"
    sort_order: int = 0


class ProgressTimelineUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None
    sort_order: Optional[int] = None


class ProgressTimelineResponse(BaseModel):
    id: int
    student_id: str
    title: str
    description: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str
    sort_order: int
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    tasks: List[ProgressTaskResponse] = []


class ProgressBoardResponse(BaseModel):
    status: str
    student_id: str
    timelines: List[ProgressTimelineResponse]
