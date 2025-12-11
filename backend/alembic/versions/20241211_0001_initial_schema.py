"""Initial schema creation

Revision ID: 0001
Revises:
Create Date: 2024-12-11

This migration creates all BibMaps database tables.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('username', sa.String(100), nullable=False),
        sa.Column('display_name', sa.String(255), nullable=True),
        sa.Column('password_hash', sa.String(255), nullable=True),
        sa.Column('role', sa.Enum('ADMIN', 'USER', name='userrole'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('oauth_provider', sa.String(50), nullable=True),
        sa.Column('oauth_id', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('last_login', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_username', 'users', ['username'], unique=True)
    op.create_index('ix_users_id', 'users', ['id'], unique=False)

    # Create allowed_emails table
    op.create_table(
        'allowed_emails',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email_pattern', sa.String(255), nullable=False),
        sa.Column('description', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_allowed_emails_email_pattern', 'allowed_emails', ['email_pattern'], unique=True)
    op.create_index('ix_allowed_emails_id', 'allowed_emails', ['id'], unique=False)

    # Create user_settings table
    op.create_table(
        'user_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('theme', sa.String(20), nullable=True, default='system'),
        sa.Column('default_node_color', sa.String(7), nullable=True, default='#3B82F6'),
        sa.Column('default_text_color', sa.String(7), nullable=True, default='#FFFFFF'),
        sa.Column('default_node_shape', sa.String(50), nullable=True, default='rectangle'),
        sa.Column('snap_to_grid', sa.Boolean(), nullable=True, default=False),
        sa.Column('grid_size', sa.Integer(), nullable=True, default=20),
        sa.Column('auto_save', sa.Boolean(), nullable=True, default=True),
        sa.Column('default_refs_page_size', sa.Integer(), nullable=True, default=20),
        sa.Column('default_refs_sort', sa.String(50), nullable=True, default='imported-desc'),
        sa.Column('email_notifications', sa.Boolean(), nullable=True, default=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )
    op.create_index('ix_user_settings_id', 'user_settings', ['id'], unique=False)

    # Create taxonomies table
    op.create_table(
        'taxonomies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('color', sa.String(7), nullable=True, default='#6B7280'),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('is_global', sa.Boolean(), nullable=True, default=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_taxonomies_id', 'taxonomies', ['id'], unique=False)

    # Create bibmaps table
    op.create_table(
        'bibmaps',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('settings_json', sa.Text(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('is_published', sa.Boolean(), nullable=True, default=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_bibmaps_id', 'bibmaps', ['id'], unique=False)

    # Create nodes table
    op.create_table(
        'nodes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('bibmap_id', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('x', sa.Float(), nullable=True, default=0.0),
        sa.Column('y', sa.Float(), nullable=True, default=0.0),
        sa.Column('background_color', sa.String(7), nullable=True, default='#3B82F6'),
        sa.Column('text_color', sa.String(7), nullable=True, default='#FFFFFF'),
        sa.Column('border_color', sa.String(7), nullable=True, default='#1E40AF'),
        sa.Column('font_size', sa.Integer(), nullable=True, default=14),
        sa.Column('font_family', sa.String(100), nullable=True, default='system-ui'),
        sa.Column('font_bold', sa.Boolean(), nullable=True, default=False),
        sa.Column('font_italic', sa.Boolean(), nullable=True, default=False),
        sa.Column('font_underline', sa.Boolean(), nullable=True, default=False),
        sa.Column('width', sa.Float(), nullable=True, default=150),
        sa.Column('height', sa.Float(), nullable=True, default=60),
        sa.Column('shape', sa.String(50), nullable=True, default='rectangle'),
        sa.Column('link_to_references', sa.Boolean(), nullable=True, default=True),
        sa.Column('wrap_text', sa.Boolean(), nullable=True, default=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['bibmap_id'], ['bibmaps.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_nodes_id', 'nodes', ['id'], unique=False)

    # Create connections table
    op.create_table(
        'connections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('bibmap_id', sa.Integer(), nullable=False),
        sa.Column('source_node_id', sa.Integer(), nullable=False),
        sa.Column('target_node_id', sa.Integer(), nullable=False),
        sa.Column('source_attach_x', sa.Float(), nullable=True),
        sa.Column('source_attach_y', sa.Float(), nullable=True),
        sa.Column('target_attach_x', sa.Float(), nullable=True),
        sa.Column('target_attach_y', sa.Float(), nullable=True),
        sa.Column('line_color', sa.String(7), nullable=True, default='#6B7280'),
        sa.Column('line_width', sa.Integer(), nullable=True, default=2),
        sa.Column('line_style', sa.String(20), nullable=True, default='solid'),
        sa.Column('arrow_type', sa.String(20), nullable=True, default='arrow'),
        sa.Column('label', sa.String(255), nullable=True),
        sa.Column('show_label', sa.Boolean(), nullable=True, default=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['bibmap_id'], ['bibmaps.id']),
        sa.ForeignKeyConstraint(['source_node_id'], ['nodes.id']),
        sa.ForeignKeyConstraint(['target_node_id'], ['nodes.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_connections_id', 'connections', ['id'], unique=False)

    # Create references table
    op.create_table(
        'references',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('bibtex_key', sa.String(255), nullable=False),
        sa.Column('entry_type', sa.String(50), nullable=False),
        sa.Column('title', sa.Text(), nullable=True),
        sa.Column('author', sa.Text(), nullable=True),
        sa.Column('year', sa.String(10), nullable=True),
        sa.Column('journal', sa.Text(), nullable=True),
        sa.Column('booktitle', sa.Text(), nullable=True),
        sa.Column('publisher', sa.Text(), nullable=True),
        sa.Column('volume', sa.String(50), nullable=True),
        sa.Column('number', sa.String(50), nullable=True),
        sa.Column('pages', sa.String(50), nullable=True),
        sa.Column('doi', sa.String(255), nullable=True),
        sa.Column('url', sa.Text(), nullable=True),
        sa.Column('abstract', sa.Text(), nullable=True),
        sa.Column('raw_bibtex', sa.Text(), nullable=False),
        sa.Column('extra_fields', sa.Text(), nullable=True),
        sa.Column('legend_category', sa.String(7), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('bibtex_key')
    )
    op.create_index('ix_references_id', 'references', ['id'], unique=False)

    # Create media table
    op.create_table(
        'media',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('url', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('legend_category', sa.String(7), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_media_id', 'media', ['id'], unique=False)

    # Create reference_taxonomies association table
    op.create_table(
        'reference_taxonomies',
        sa.Column('reference_id', sa.Integer(), nullable=False),
        sa.Column('taxonomy_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['reference_id'], ['references.id']),
        sa.ForeignKeyConstraint(['taxonomy_id'], ['taxonomies.id']),
        sa.PrimaryKeyConstraint('reference_id', 'taxonomy_id')
    )

    # Create node_taxonomies association table
    op.create_table(
        'node_taxonomies',
        sa.Column('node_id', sa.Integer(), nullable=False),
        sa.Column('taxonomy_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['node_id'], ['nodes.id']),
        sa.ForeignKeyConstraint(['taxonomy_id'], ['taxonomies.id']),
        sa.PrimaryKeyConstraint('node_id', 'taxonomy_id')
    )

    # Create media_taxonomies association table
    op.create_table(
        'media_taxonomies',
        sa.Column('media_id', sa.Integer(), nullable=False),
        sa.Column('taxonomy_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['media_id'], ['media.id']),
        sa.ForeignKeyConstraint(['taxonomy_id'], ['taxonomies.id']),
        sa.PrimaryKeyConstraint('media_id', 'taxonomy_id')
    )


def downgrade() -> None:
    # Drop association tables first
    op.drop_table('media_taxonomies')
    op.drop_table('node_taxonomies')
    op.drop_table('reference_taxonomies')

    # Drop entity tables
    op.drop_index('ix_media_id', table_name='media')
    op.drop_table('media')

    op.drop_index('ix_references_id', table_name='references')
    op.drop_table('references')

    op.drop_index('ix_connections_id', table_name='connections')
    op.drop_table('connections')

    op.drop_index('ix_nodes_id', table_name='nodes')
    op.drop_table('nodes')

    op.drop_index('ix_bibmaps_id', table_name='bibmaps')
    op.drop_table('bibmaps')

    op.drop_index('ix_taxonomies_id', table_name='taxonomies')
    op.drop_table('taxonomies')

    op.drop_index('ix_user_settings_id', table_name='user_settings')
    op.drop_table('user_settings')

    op.drop_index('ix_allowed_emails_id', table_name='allowed_emails')
    op.drop_index('ix_allowed_emails_email_pattern', table_name='allowed_emails')
    op.drop_table('allowed_emails')

    op.drop_index('ix_users_id', table_name='users')
    op.drop_index('ix_users_username', table_name='users')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')

    # Drop the enum type (for PostgreSQL/MSSQL)
    op.execute('DROP TYPE IF EXISTS userrole')
