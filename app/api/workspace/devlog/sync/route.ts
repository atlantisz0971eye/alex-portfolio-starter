/**
 * Devlog entries are no longer written from commits by the model: the devlog is written by the person and by Claude
 * over MCP. Commit counts are read live from GitHub where they are shown (the Projects view). Kept so an old page gets
 * a clear answer instead of a 404.
 */
export function POST() {
  return Response.json({ error: "sync_retired", message: "Commits are no longer turned into devlog entries." }, { status: 410 });
}
