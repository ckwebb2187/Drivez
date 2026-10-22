// Database tables. Every statement is safe to run repeatedly.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    password_hash TEXT,
    display_name TEXT,
    username TEXT UNIQUE,
    bio TEXT,
    location TEXT,
    ghost_mode INTEGER NOT NULL DEFAULT 0,
    avatar_url TEXT,
    color TEXT,
    google_id TEXT UNIQUE,
    discord_id TEXT UNIQUE,
    facebook_id TEXT UNIQUE,
    discord_webhook TEXT,
    discord_auto INTEGER NOT NULL DEFAULT 0,
    created_date TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS resets (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, provider TEXT, next TEXT, expires INTEGER)`,
  `CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    entity TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_date TEXT,
    updated_date TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS records_owner ON records(entity, owner_id, created_date)`,
  `CREATE TABLE IF NOT EXISTS friends (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL,
    addressee_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_date TEXT,
    UNIQUE(requester_id, addressee_id)
  )`,
  `CREATE TABLE IF NOT EXISTS live (user_id TEXT PRIMARY KEY, lat REAL, lng REAL, speed INTEGER, updated INTEGER)`,
  `CREATE TABLE IF NOT EXISTS live_pos (user_id TEXT PRIMARY KEY, lat REAL, lng REAL, speed INTEGER, heading REAL, car_body TEXT, car_color TEXT, updated INTEGER)`,
  `CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    created INTEGER NOT NULL,
    expires INTEGER NOT NULL,
    confirms INTEGER NOT NULL DEFAULT 0,
    dismissals INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS reports_area ON reports(expires, lat, lng)`,
  `CREATE TABLE IF NOT EXISTS report_votes (report_id TEXT NOT NULL, user_id TEXT NOT NULL, still_there INTEGER NOT NULL, PRIMARY KEY (report_id, user_id))`,
];
