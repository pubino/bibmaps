#!/usr/bin/env python3
"""
Database migration script for BibMap user management.

This script migrates the database schema to support proper user ownership:
1. Adds user_id and is_global columns to taxonomies table
2. Converts user_id from VARCHAR to INTEGER FK in bibmaps and references tables

IMPORTANT: Back up your database before running this script!

Usage:
    python scripts/migrate_user_ids.py [--db-path PATH]

Default db-path: ./data/bibmap.db
"""
import argparse
import os
import shutil
import sqlite3
import sys
from datetime import datetime


def get_db_path():
    """Get database path from args or environment."""
    parser = argparse.ArgumentParser(description="Migrate BibMap database schema")
    parser.add_argument(
        "--db-path",
        default=os.getenv("DATABASE_PATH", "./data/bibmap.db"),
        help="Path to SQLite database file"
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Skip creating backup (not recommended)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes"
    )
    args = parser.parse_args()
    return args.db_path, args.no_backup, args.dry_run


def backup_database(db_path: str) -> str:
    """Create a timestamped backup of the database."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{db_path}.backup_{timestamp}"
    shutil.copy2(db_path, backup_path)
    return backup_path


def quote_table(table: str) -> str:
    """Quote table name if it's a reserved word."""
    reserved = ["references"]
    if table.lower() in reserved:
        return f'"{table}"'
    return table


def check_column_exists(cursor, table: str, column: str) -> bool:
    """Check if a column exists in a table."""
    cursor.execute(f"PRAGMA table_info({quote_table(table)})")
    columns = [row[1] for row in cursor.fetchall()]
    return column in columns


def check_column_type(cursor, table: str, column: str) -> str:
    """Get the type of a column."""
    cursor.execute(f"PRAGMA table_info({quote_table(table)})")
    for row in cursor.fetchall():
        if row[1] == column:
            return row[2].upper()
    return ""


def migrate_taxonomies(cursor, dry_run: bool) -> list:
    """Add user_id and is_global columns to taxonomies table."""
    changes = []

    if not check_column_exists(cursor, "taxonomies", "user_id"):
        changes.append("ADD taxonomies.user_id INTEGER")
        if not dry_run:
            cursor.execute("ALTER TABLE taxonomies ADD COLUMN user_id INTEGER REFERENCES users(id)")

    if not check_column_exists(cursor, "taxonomies", "is_global"):
        changes.append("ADD taxonomies.is_global BOOLEAN DEFAULT 0")
        if not dry_run:
            cursor.execute("ALTER TABLE taxonomies ADD COLUMN is_global BOOLEAN DEFAULT 0")
            # Mark existing taxonomies as global since they were created before user system
            cursor.execute("UPDATE taxonomies SET is_global = 1 WHERE user_id IS NULL")
            changes.append("SET existing taxonomies to is_global=1")

    return changes


def migrate_table_user_id(cursor, table: str, dry_run: bool) -> list:
    """Convert user_id from VARCHAR to INTEGER for a table."""
    changes = []
    quoted_table = quote_table(table)

    if not check_column_exists(cursor, table, "user_id"):
        return [f"SKIP {table}: no user_id column"]

    col_type = check_column_type(cursor, table, "user_id")
    if col_type == "INTEGER":
        return [f"SKIP {table}.user_id: already INTEGER"]

    if col_type != "VARCHAR(255)":
        return [f"SKIP {table}.user_id: unexpected type {col_type}"]

    changes.append(f"CONVERT {table}.user_id VARCHAR(255) -> INTEGER")

    if dry_run:
        return changes

    # Get current table schema
    cursor.execute(f"SELECT sql FROM sqlite_master WHERE type='table' AND name='{table}'")
    original_sql = cursor.fetchone()[0]

    # Create new schema with INTEGER user_id
    new_sql = original_sql.replace(
        "user_id VARCHAR(255)",
        "user_id INTEGER REFERENCES users(id)"
    )

    # SQLite migration: create new table, copy data, drop old, rename new
    temp_table = f"{table}_migration_temp"

    # Create temp table with new schema
    # Handle various naming formats in the CREATE TABLE statement
    temp_sql = new_sql
    temp_sql = temp_sql.replace(f'CREATE TABLE IF NOT EXISTS "{table}"', f'CREATE TABLE "{temp_table}"')
    temp_sql = temp_sql.replace(f'CREATE TABLE "{table}"', f'CREATE TABLE "{temp_table}"')
    temp_sql = temp_sql.replace(f'CREATE TABLE {table}', f'CREATE TABLE "{temp_table}"')
    cursor.execute(temp_sql)

    # Get column names (excluding user_id for special handling)
    cursor.execute(f"PRAGMA table_info({quoted_table})")
    columns = [row[1] for row in cursor.fetchall()]

    # Copy data, converting user_id from string to int
    cols_str = ", ".join(columns)
    cols_select = []
    for col in columns:
        if col == "user_id":
            # Convert empty string/null to NULL, otherwise cast to int
            cols_select.append("CASE WHEN user_id IS NULL OR user_id = '' THEN NULL ELSE CAST(user_id AS INTEGER) END")
        else:
            cols_select.append(col)
    cols_select_str = ", ".join(cols_select)

    quoted_temp = f'"{temp_table}"'
    cursor.execute(f"INSERT INTO {quoted_temp} ({cols_str}) SELECT {cols_select_str} FROM {quoted_table}")
    changes.append(f"COPY {cursor.rowcount} rows from {table}")

    # Drop old table and rename new
    cursor.execute(f"DROP TABLE {quoted_table}")
    cursor.execute(f"ALTER TABLE {quoted_temp} RENAME TO {quoted_table}")
    changes.append(f"RENAME {temp_table} -> {table}")

    # Recreate indexes
    cursor.execute(f"CREATE INDEX IF NOT EXISTS ix_{table}_id ON {quoted_table} (id)")

    return changes


def verify_foreign_keys(cursor) -> list:
    """Verify foreign key constraints after migration."""
    issues = []

    # Check bibmaps.user_id references valid users
    if check_column_exists(cursor, "bibmaps", "user_id"):
        cursor.execute("""
            SELECT b.id, b.user_id
            FROM bibmaps b
            WHERE b.user_id IS NOT NULL
            AND b.user_id NOT IN (SELECT id FROM users)
        """)
        orphans = cursor.fetchall()
        if orphans:
            issues.append(f"WARNING: {len(orphans)} bibmaps reference non-existent users: {orphans[:5]}")

    # Check references.user_id references valid users
    if check_column_exists(cursor, "references", "user_id"):
        cursor.execute("""
            SELECT r.id, r.user_id
            FROM "references" r
            WHERE r.user_id IS NOT NULL
            AND r.user_id NOT IN (SELECT id FROM users)
        """)
        orphans = cursor.fetchall()
        if orphans:
            issues.append(f"WARNING: {len(orphans)} references reference non-existent users: {orphans[:5]}")

    # Check taxonomies.user_id references valid users
    if check_column_exists(cursor, "taxonomies", "user_id"):
        cursor.execute("""
            SELECT t.id, t.user_id
            FROM taxonomies t
            WHERE t.user_id IS NOT NULL
            AND t.user_id NOT IN (SELECT id FROM users)
        """)
        orphans = cursor.fetchall()
        if orphans:
            issues.append(f"WARNING: {len(orphans)} taxonomies reference non-existent users: {orphans[:5]}")

    return issues


def main():
    db_path, no_backup, dry_run = get_db_path()

    print(f"BibMap Database Migration Script")
    print(f"=" * 50)
    print(f"Database: {db_path}")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    print()

    if not os.path.exists(db_path):
        print(f"ERROR: Database not found: {db_path}")
        sys.exit(1)

    # Create backup
    if not dry_run and not no_backup:
        backup_path = backup_database(db_path)
        print(f"Backup created: {backup_path}")
        print()

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Disable foreign keys during migration (SQLite requires this for table recreation)
    cursor.execute("PRAGMA foreign_keys = OFF")

    all_changes = []

    # Migrate taxonomies table
    print("Migrating taxonomies table...")
    changes = migrate_taxonomies(cursor, dry_run)
    all_changes.extend(changes)
    for change in changes:
        print(f"  {change}")
    print()

    # Migrate bibmaps table
    print("Migrating bibmaps table...")
    changes = migrate_table_user_id(cursor, "bibmaps", dry_run)
    all_changes.extend(changes)
    for change in changes:
        print(f"  {change}")
    print()

    # Migrate references table
    print("Migrating references table...")
    changes = migrate_table_user_id(cursor, "references", dry_run)
    all_changes.extend(changes)
    for change in changes:
        print(f"  {change}")
    print()

    # Verify foreign keys
    print("Verifying foreign keys...")
    issues = verify_foreign_keys(cursor)
    if issues:
        for issue in issues:
            print(f"  {issue}")
    else:
        print("  All foreign keys valid")
    print()

    if dry_run:
        print("DRY RUN complete. No changes made.")
        conn.close()
    else:
        # Commit changes
        conn.commit()

        # Re-enable foreign keys and verify integrity
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("PRAGMA foreign_key_check")
        fk_violations = cursor.fetchall()
        if fk_violations:
            print(f"WARNING: Foreign key violations found: {fk_violations[:5]}")

        print(f"Migration complete. {len(all_changes)} changes applied.")

        # Final verification
        print()
        print("Final schema verification:")
        for table in ["users", "bibmaps", "references", "taxonomies"]:
            cursor.execute(f"PRAGMA table_info({quote_table(table)})")
            cols = {row[1]: row[2] for row in cursor.fetchall()}
            if "user_id" in cols:
                print(f"  {table}.user_id: {cols['user_id']}")

        conn.close()

    return 0 if not issues else 1


if __name__ == "__main__":
    sys.exit(main())
