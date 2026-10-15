import { BoardError } from "./boardStore";

export function boardFailure(error: unknown) {
  if (error instanceof BoardError) return Response.json({ error: "invalid_board", message: error.message }, { status: 400 });
  return Response.json({ error: "boards_failed" }, { status: 502 });
}
