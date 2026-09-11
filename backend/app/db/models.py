from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Student(Base):
    __tablename__ = "students"

    id: Mapped[str] = mapped_column(
        String(128),
        primary_key=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
    )


class StudentProfileMemory(Base):
    __tablename__ = "student_profile_memory"

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        primary_key=True,
    )

    profile_json: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class StudentMemory(Base):
    __tablename__ = "student_memory"

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        primary_key=True,
    )

    summary: Mapped[str] = mapped_column(
        Text,
        default="",
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        index=True,
    )

    role: Mapped[str] = mapped_column(
        String(32),
    )

    content: Mapped[str] = mapped_column(
        Text,
    )

    summarized: Mapped[bool] = mapped_column(
        default=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        index=True,
    )


class SectionResponse(Base):
    __tablename__ = "section_responses"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        index=True,
    )

    section: Mapped[str] = mapped_column(
        String(64),
        index=True,
    )

    prompt: Mapped[str] = mapped_column(
        Text,
    )

    backend_prompt: Mapped[str] = mapped_column(
        Text,
    )

    response_json: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        index=True,
    )


class ResumeDocument(Base):
    __tablename__ = "resume_documents"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        index=True,
    )

    original_filename: Mapped[str] = mapped_column(
        String(255),
    )

    stored_filename: Mapped[str] = mapped_column(
        String(255),
    )

    file_path: Mapped[str] = mapped_column(
        Text,
    )

    content_type: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
    )

    size_bytes: Mapped[int] = mapped_column(
        BigInteger,
    )

    sha256: Mapped[str] = mapped_column(
        String(64),
        index=True,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        index=True,
    )

    parsed_profile_json: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        index=True,
    )

    replaced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class ProgressTimeline(Base):
    __tablename__ = "progress_timelines"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(255),
    )

    description: Mapped[str] = mapped_column(
        Text,
        default="",
    )

    start_date: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
    )

    end_date: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(64),
        default="not_started",
        index=True,
    )

    sort_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        index=True,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class ProgressTask(Base):
    __tablename__ = "progress_tasks"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    timeline_id: Mapped[int] = mapped_column(
        ForeignKey("progress_timelines.id", ondelete="CASCADE"),
        index=True,
    )

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(255),
    )

    notes: Mapped[str] = mapped_column(
        Text,
        default="",
    )

    status: Mapped[str] = mapped_column(
        String(64),
        default="not_started",
        index=True,
    )

    priority: Mapped[str] = mapped_column(
        String(64),
        default="medium",
    )

    due_date: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
    )

    sort_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        index=True,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
