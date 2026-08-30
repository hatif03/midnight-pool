// Minimal persistence for match-result attestation (docs/adr/0009). Reuses the
// existing --max-instances=1 Cloud Run relay (docs/adr/0004) rather than a new
// service; node:sqlite is built into Node so this adds zero new dependencies.
// ponytail: a local file on Cloud Run's writable-but-ephemeral filesystem --
// survives across requests to the one running instance, wiped on redeploy/cold
// start. Fine for a demo; a real deployment needs a managed DB (Cloud SQL, etc).
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.env.DB_PATH || 'relay.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS attestations (
    match_id TEXT NOT NULL,
    pk TEXT NOT NULL,
    role INTEGER NOT NULL,
    winner INTEGER NOT NULL,
    level INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (match_id, pk)
  )
`);

const upsert = db.prepare(`
  INSERT INTO attestations (match_id, pk, role, winner, level, wins, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(match_id, pk) DO UPDATE SET
    role = excluded.role, winner = excluded.winner,
    level = excluded.level, wins = excluded.wins, created_at = excluded.created_at
`);
const forMatch = db.prepare('SELECT * FROM attestations WHERE match_id = ?');
const latestForPk = db.prepare(`
  SELECT a.level, a.wins, a.match_id FROM attestations a
  WHERE a.pk = ?
    AND (SELECT COUNT(*) FROM attestations b WHERE b.match_id = a.match_id) >= 2
    AND (SELECT COUNT(DISTINCT b.winner) FROM attestations b WHERE b.match_id = a.match_id) = 1
  ORDER BY a.created_at DESC LIMIT 1
`);

/**
 * Records one side's attestation for a match. A match is "confirmed" once at
 * least two distinct sides have attested and they all agree on the winner --
 * this is the server-side check the client-only path (both peers award their
 * own local profile independently, no cross-check) never had. Still not
 * fraud-proof against two colluding peers, only against a lone dishonest one.
 */
export function recordAttestation({ matchId, pk, role, winner, level, wins }) {
  upsert.run(matchId, pk, role, winner, level, wins, Date.now());
  const rows = forMatch.all(matchId);
  const confirmed = rows.length >= 2 && rows.every((r) => r.winner === rows[0].winner);
  return { confirmed, sideCount: rows.length };
}

/** Most recent level/wins this pk attested to as part of a confirmed match. */
export function latestConfirmedStats(pk) {
  return latestForPk.get(pk) || null;
}
