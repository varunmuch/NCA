"""account security: email verification, password reset, session revocation

Revision ID: 0004_account_security
Revises: 0003_career_roadmaps
Create Date: 2026-10-15 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0004_account_security'
down_revision: Union[str, Sequence[str], None] = '0003_career_roadmaps'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('student_password_credentials', sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('student_password_credentials', sa.Column('password_changed_at', sa.DateTime(timezone=True), nullable=True))
    op.create_table('auth_tokens',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('student_id', sa.String(length=128), nullable=False),
    sa.Column('purpose', sa.String(length=32), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index(op.f('ix_auth_tokens_student_id'), 'auth_tokens', ['student_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_auth_tokens_student_id'), table_name='auth_tokens')
    op.drop_table('auth_tokens')
    op.drop_column('student_password_credentials', 'password_changed_at')
    op.drop_column('student_password_credentials', 'email_verified_at')
