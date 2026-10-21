"""career roadmaps

Revision ID: 0003_career_roadmaps
Revises: 0002_counselor
Create Date: 2026-10-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0003_career_roadmaps'
down_revision: Union[str, Sequence[str], None] = '0002_counselor'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('career_roadmaps',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('student_id', sa.String(length=128), nullable=False),
    sa.Column('career_slug', sa.String(length=128), nullable=False),
    sa.Column('content', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('timeline_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('student_id', 'career_slug', name='uq_career_roadmaps_student_slug')
    )
    op.create_index(op.f('ix_career_roadmaps_student_id'), 'career_roadmaps', ['student_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_career_roadmaps_student_id'), table_name='career_roadmaps')
    op.drop_table('career_roadmaps')
