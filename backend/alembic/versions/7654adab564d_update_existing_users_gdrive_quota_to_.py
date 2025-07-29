"""Update existing users gdrive quota to 50GB

Revision ID: 7654adab564d
Revises: ee6b87b19da2
Create Date: 2025-07-26 21:16:09.830025

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7654adab564d'
down_revision: Union[str, None] = 'ee6b87b19da2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("UPDATE users SET gdrive_quota_gb = 50")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("UPDATE users SET gdrive_quota_gb = 30")
