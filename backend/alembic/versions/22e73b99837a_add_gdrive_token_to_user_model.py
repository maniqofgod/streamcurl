"""Add gdrive_token to User model

Revision ID: 22e73b99837a
Revises: ee6b87b19da2
Create Date: 2025-07-27 10:38:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '22e73b99837a'
down_revision = 'ee6b87b19da2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('gdrive_token', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('users', 'gdrive_token')