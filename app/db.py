import os
import sqlite3

DB_PATH = os.environ.get("CUBETIMER_DB", "/app/data/cubetimer.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_sub TEXT UNIQUE NOT NULL,
    email TEXT,
    name TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    event TEXT NOT NULL DEFAULT '333',
    user_id INTEGER,
    client_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS solves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    scramble TEXT NOT NULL,
    time_ms INTEGER NOT NULL,
    penalty TEXT NOT NULL DEFAULT 'NONE' CHECK (penalty IN ('NONE', 'PLUS_TWO', 'DNF')),
    client_id TEXT,
    session_client_id TEXT,
    solved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_solves_session ON solves(session_id);
"""


def get_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}


def migrate(conn: sqlite3.Connection) -> None:
    """Add auth/sync columns to DBs created before this feature."""
    sess = _columns(conn, "sessions")
    if "user_id" not in sess:
        conn.execute("ALTER TABLE sessions ADD COLUMN user_id INTEGER")
    if "client_id" not in sess:
        conn.execute("ALTER TABLE sessions ADD COLUMN client_id TEXT")

    sols = _columns(conn, "solves")
    if "client_id" not in sols:
        conn.execute("ALTER TABLE solves ADD COLUMN client_id TEXT")
    if "session_client_id" not in sols:
        conn.execute("ALTER TABLE solves ADD COLUMN session_client_id TEXT")

    conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_client ON sessions(user_id, client_id)")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_solves_client ON solves(client_id)")


def init_db() -> None:
    conn = get_conn()
    try:
        conn.executescript(SCHEMA)
        migrate(conn)
        conn.commit()
    finally:
        conn.close()
