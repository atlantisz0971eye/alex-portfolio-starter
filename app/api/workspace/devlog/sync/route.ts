/**
 * The old per-project "sync commits into the devlog" button is retired. Entries from commits are now written by
 * Carcosa's scribe from the ledger (`app/lib/carcosa/scribe.ts`), on the scheduled check or "check now". Kept so an old
 * page gets a clear answer instead of a 404.
 */
export function POST() {
  return Response.json({ error: "sync_retired", message: "Commits are now logged by Carcosa from the ledger." }, { status: 410 });
}
