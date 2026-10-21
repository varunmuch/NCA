from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
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


class StudentAuthIdentity(Base):
    __tablename__ = "student_auth_identities"

    __table_args__ = (
        UniqueConstraint(
            "provider",
            "provider_subject",
            name="uq_student_auth_identity_provider_subject",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        index=True,
    )

    provider: Mapped[str] = mapped_column(
        String(64),
        index=True,
    )

    provider_subject: Mapped[str] = mapped_column(
        String(255),
        index=True,
    )

    email: Mapped[str] = mapped_column(
        String(320),
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(255),
        default="",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        index=True,
    )

    last_login_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        index=True,
    )


class StudentPasswordCredential(Base):
    __tablename__ = "student_password_credentials"

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        primary_key=True,
    )

    email: Mapped[str] = mapped_column(
        String(320),
        unique=True,
        index=True,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
    )

    failed_attempts: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )

    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Set once the student clicks a link sent to this address.
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Sessions that signed in before this moment are no longer accepted.
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
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

    conversation_id: Mapped[str | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Rendering details for assistant turns: career cards, suggested
    # actions, proposed facts, module results.
    metadata_json: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        server_default="{}",
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

    # "resume" or "transcript". The table keeps its historical name.
    doc_type: Mapped[str] = mapped_column(
        String(32),
        default="resume",
        server_default="resume",
        index=True,
    )

    # "processing", "processed", or "failed".
    status: Mapped[str] = mapped_column(
        String(32),
        default="processed",
        server_default="processed",
    )

    # "text", "vision", or "" when extraction has not run.
    extraction_method: Mapped[str] = mapped_column(
        String(32),
        default="",
        server_default="",
    )

    extracted_text: Mapped[str] = mapped_column(
        Text,
        default="",
        server_default="",
    )

    error_message: Mapped[str] = mapped_column(
        Text,
        default="",
        server_default="",
    )

    deleted_at: Mapped[datetime | None] = mapped_column(
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

    plan_id: Mapped[str | None] = mapped_column(
        ForeignKey("career_plans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
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


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
    )

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(255),
        default="New conversation",
    )

    # Concise summary of messages older than the recent window.
    summary: Mapped[str] = mapped_column(
        Text,
        default="",
        server_default="",
    )

    summarized_through_message_id: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        server_default="0",
    )

    is_legacy: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        index=True,
    )

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class StudentFact(Base):
    """
    One remembered piece of information about a student.

    status separates what the student confirmed from what the AI
    suggested, so a guess is never treated as an established fact.
    """

    __tablename__ = "student_facts"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        index=True,
    )

    category: Mapped[str] = mapped_column(
        String(64),
        index=True,
    )

    value: Mapped[str] = mapped_column(
        Text,
    )

    # "confirmed", "suggested", or "dismissed".
    status: Mapped[str] = mapped_column(
        String(32),
        default="suggested",
        index=True,
    )

    # "student", "conversation", or "document".
    source_type: Mapped[str] = mapped_column(
        String(32),
        default="student",
    )

    source_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    source_excerpt: Mapped[str] = mapped_column(
        Text,
        default="",
        server_default="",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    __table_args__ = (
        Index(
            "ix_document_chunks_tsv",
            "tsv",
            postgresql_using="gin",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    document_id: Mapped[int] = mapped_column(
        ForeignKey("resume_documents.id", ondelete="CASCADE"),
        index=True,
    )

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        index=True,
    )

    chunk_index: Mapped[int] = mapped_column(
        Integer,
    )

    content: Mapped[str] = mapped_column(
        Text,
    )

    tsv = mapped_column(
        TSVECTOR,
        Computed(
            "to_tsvector('english', content)",
            persisted=True,
        ),
    )


class CareerPlan(Base):
    __tablename__ = "career_plans"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
    )

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        index=True,
    )

    # Versions of one plan share a lineage id (the first version's id).
    lineage_id: Mapped[str] = mapped_column(
        String(36),
        index=True,
    )

    version: Mapped[int] = mapped_column(
        Integer,
        default=1,
    )

    title: Mapped[str] = mapped_column(
        String(255),
    )

    career_goal: Mapped[str] = mapped_column(
        String(255),
        default="",
    )

    content: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )

    # "draft" until the student saves it.
    status: Mapped[str] = mapped_column(
        String(32),
        default="draft",
    )

    revision_note: Mapped[str] = mapped_column(
        Text,
        default="",
        server_default="",
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

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class SavedCareer(Base):
    __tablename__ = "saved_careers"

    __table_args__ = (
        UniqueConstraint(
            "student_id",
            "career_slug",
            name="uq_saved_careers_student_slug",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        index=True,
    )

    career_slug: Mapped[str] = mapped_column(
        String(128),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
    )


class CareerRoadmap(Base):
    """A student's personalized roadmap for one catalog career."""

    __tablename__ = "career_roadmaps"

    __table_args__ = (
        UniqueConstraint(
            "student_id",
            "career_slug",
            name="uq_career_roadmaps_student_slug",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        index=True,
    )

    career_slug: Mapped[str] = mapped_column(
        String(128),
    )

    content: Mapped[dict] = mapped_column(
        JSONB,
    )

    # Set once the student adds the roadmap's goals to My Progress.
    timeline_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class AuthToken(Base):
    """One-time link token (password reset or email verification)."""

    __tablename__ = "auth_tokens"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        index=True,
    )

    purpose: Mapped[str] = mapped_column(
        String(32),
    )

    # Only a SHA-256 of the token is stored; the token itself is only in
    # the emailed link.
    token_hash: Mapped[str] = mapped_column(
        String(64),
        unique=True,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
    )

    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
    )
