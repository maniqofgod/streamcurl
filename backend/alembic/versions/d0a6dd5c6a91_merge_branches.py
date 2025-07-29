"""Merge branches

Revision ID: d0a6dd5c6a91
Revises: 22e73b99837a, 7654adab564d
Create Date: 2025-07-27 10:55:33.860616

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd0a6dd5c6a91'
down_revision: Union[str, Sequence[str], None] = ('22e73b99837a', '7654adab564d')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
