"""Tests for the database migration script."""
import os
import sqlite3
import sys
import tempfile
import pytest

# Add scripts directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'scripts'))

from migrate_user_ids import (
    check_column_exists,
    check_column_type,
    migrate_taxonomies,
    migrate_table_user_id,
    verify_foreign_keys,
    quote_table,
)


@pytest.fixture
def test_db():
    """Create a temporary test database with old schema."""
    fd, path = tempfile.mkstemp(suffix='.db')
    os.close(fd)

    conn = sqlite3.connect(path)
    cursor = conn.cursor()

    # Create users table (new schema)
    cursor.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            username VARCHAR(100) UNIQUE NOT NULL,
            display_name VARCHAR(255),
            password_hash VARCHAR(255),
            role VARCHAR(5) NOT NULL DEFAULT 'user',
            is_active BOOLEAN NOT NULL DEFAULT 1,
            oauth_provider VARCHAR(50),
            oauth_id VARCHAR(255),
            created_at DATETIME,
            updated_at DATETIME,
            last_login DATETIME
        )
    """)

    # Create bibmaps table (old schema with VARCHAR user_id)
    cursor.execute("""
        CREATE TABLE bibmaps (
            id INTEGER PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            user_id VARCHAR(255),
            is_published BOOLEAN DEFAULT 0,
            created_at DATETIME,
            updated_at DATETIME
        )
    """)

    # Create references table (old schema with VARCHAR user_id)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS "references" (
            id INTEGER PRIMARY KEY,
            bibtex_key VARCHAR(255) NOT NULL UNIQUE,
            entry_type VARCHAR(50) NOT NULL,
            title TEXT,
            author TEXT,
            year VARCHAR(10),
            raw_bibtex TEXT NOT NULL,
            user_id VARCHAR(255),
            created_at DATETIME,
            updated_at DATETIME
        )
    """)

    # Create taxonomies table (old schema without user_id)
    cursor.execute("""
        CREATE TABLE taxonomies (
            id INTEGER PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            description TEXT,
            color VARCHAR(7) DEFAULT '#6B7280',
            created_at DATETIME
        )
    """)

    # Insert test data
    cursor.execute("INSERT INTO users (email, username) VALUES ('test@test.com', 'testuser')")
    cursor.execute("INSERT INTO bibmaps (title, user_id) VALUES ('Test Map', '1')")
    cursor.execute('INSERT INTO "references" (bibtex_key, entry_type, raw_bibtex, user_id) VALUES ("key1", "article", "@article{}", "1")')
    cursor.execute("INSERT INTO taxonomies (name) VALUES ('Test Tag')")

    conn.commit()

    yield path, conn, cursor

    conn.close()
    os.unlink(path)


class TestQuoteTable:
    def test_quotes_reserved_word(self):
        assert quote_table("references") == '"references"'

    def test_no_quote_normal_table(self):
        assert quote_table("bibmaps") == "bibmaps"
        assert quote_table("users") == "users"


class TestCheckColumnExists:
    def test_column_exists(self, test_db):
        _, _, cursor = test_db
        assert check_column_exists(cursor, "bibmaps", "user_id") is True
        assert check_column_exists(cursor, "bibmaps", "title") is True

    def test_column_not_exists(self, test_db):
        _, _, cursor = test_db
        assert check_column_exists(cursor, "bibmaps", "nonexistent") is False

    def test_references_table(self, test_db):
        _, _, cursor = test_db
        assert check_column_exists(cursor, "references", "user_id") is True


class TestCheckColumnType:
    def test_varchar_type(self, test_db):
        _, _, cursor = test_db
        assert check_column_type(cursor, "bibmaps", "user_id") == "VARCHAR(255)"

    def test_integer_type(self, test_db):
        _, _, cursor = test_db
        assert check_column_type(cursor, "bibmaps", "id") == "INTEGER"


class TestMigrateTaxonomies:
    def test_adds_user_id_column(self, test_db):
        _, _, cursor = test_db
        assert check_column_exists(cursor, "taxonomies", "user_id") is False

        changes = migrate_taxonomies(cursor, dry_run=False)

        assert check_column_exists(cursor, "taxonomies", "user_id") is True
        assert "ADD taxonomies.user_id INTEGER" in changes

    def test_adds_is_global_column(self, test_db):
        _, _, cursor = test_db
        assert check_column_exists(cursor, "taxonomies", "is_global") is False

        changes = migrate_taxonomies(cursor, dry_run=False)

        assert check_column_exists(cursor, "taxonomies", "is_global") is True
        assert "ADD taxonomies.is_global BOOLEAN DEFAULT 0" in changes

    def test_sets_existing_as_global(self, test_db):
        _, _, cursor = test_db
        migrate_taxonomies(cursor, dry_run=False)

        cursor.execute("SELECT is_global FROM taxonomies WHERE name = 'Test Tag'")
        result = cursor.fetchone()
        assert result[0] == 1  # Existing taxonomies should be global

    def test_dry_run_no_changes(self, test_db):
        _, _, cursor = test_db
        changes = migrate_taxonomies(cursor, dry_run=True)

        assert len(changes) == 2  # Would add 2 columns
        assert check_column_exists(cursor, "taxonomies", "user_id") is False


class TestMigrateTableUserId:
    def test_converts_varchar_to_integer(self, test_db):
        _, conn, cursor = test_db

        assert check_column_type(cursor, "bibmaps", "user_id") == "VARCHAR(255)"

        changes = migrate_table_user_id(cursor, "bibmaps", dry_run=False)
        conn.commit()

        assert "CONVERT bibmaps.user_id VARCHAR(255) -> INTEGER" in changes
        # SQLite doesn't show REFERENCES in PRAGMA, but the column type changes
        col_type = check_column_type(cursor, "bibmaps", "user_id")
        assert "INTEGER" in col_type

    def test_converts_user_id_value(self, test_db):
        _, conn, cursor = test_db

        migrate_table_user_id(cursor, "bibmaps", dry_run=False)
        conn.commit()

        cursor.execute("SELECT user_id, typeof(user_id) FROM bibmaps WHERE title = 'Test Map'")
        result = cursor.fetchone()
        assert result[0] == 1  # String '1' converted to integer 1
        assert result[1] == "integer"

    def test_skips_already_integer(self, test_db):
        _, conn, cursor = test_db

        # First migration
        migrate_table_user_id(cursor, "bibmaps", dry_run=False)
        conn.commit()

        # Second attempt should skip
        changes = migrate_table_user_id(cursor, "bibmaps", dry_run=False)
        assert "SKIP bibmaps.user_id: already INTEGER" in changes

    def test_handles_references_table(self, test_db):
        _, conn, cursor = test_db

        changes = migrate_table_user_id(cursor, "references", dry_run=False)
        conn.commit()

        assert "CONVERT references.user_id VARCHAR(255) -> INTEGER" in changes

        cursor.execute('SELECT user_id, typeof(user_id) FROM "references" WHERE bibtex_key = "key1"')
        result = cursor.fetchone()
        assert result[0] == 1
        assert result[1] == "integer"

    def test_handles_null_user_id(self, test_db):
        _, conn, cursor = test_db

        cursor.execute("INSERT INTO bibmaps (title) VALUES ('No Owner')")
        conn.commit()

        migrate_table_user_id(cursor, "bibmaps", dry_run=False)
        conn.commit()

        cursor.execute("SELECT user_id FROM bibmaps WHERE title = 'No Owner'")
        result = cursor.fetchone()
        assert result[0] is None

    def test_handles_empty_string_user_id(self, test_db):
        _, conn, cursor = test_db

        cursor.execute("INSERT INTO bibmaps (title, user_id) VALUES ('Empty Owner', '')")
        conn.commit()

        migrate_table_user_id(cursor, "bibmaps", dry_run=False)
        conn.commit()

        cursor.execute("SELECT user_id FROM bibmaps WHERE title = 'Empty Owner'")
        result = cursor.fetchone()
        assert result[0] is None  # Empty string becomes NULL


class TestVerifyForeignKeys:
    def test_valid_foreign_keys(self, test_db):
        _, conn, cursor = test_db

        # Run migrations first
        migrate_taxonomies(cursor, dry_run=False)
        migrate_table_user_id(cursor, "bibmaps", dry_run=False)
        migrate_table_user_id(cursor, "references", dry_run=False)
        conn.commit()

        issues = verify_foreign_keys(cursor)
        assert len(issues) == 0

    def test_detects_orphan_references(self, test_db):
        _, conn, cursor = test_db

        # Run migrations
        migrate_taxonomies(cursor, dry_run=False)
        migrate_table_user_id(cursor, "bibmaps", dry_run=False)
        migrate_table_user_id(cursor, "references", dry_run=False)
        conn.commit()

        # Create orphan record (user_id 999 doesn't exist)
        cursor.execute("UPDATE bibmaps SET user_id = 999 WHERE title = 'Test Map'")
        conn.commit()

        issues = verify_foreign_keys(cursor)
        assert len(issues) == 1
        assert "bibmaps reference non-existent users" in issues[0]
