/** Puts a piece of text in the notebook as one entry, with where it came from on its first line. The notebook files it. */
export async function keepInNotebook(text: string): Promise<void> {
  const response = await fetch("/api/workspace/mind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", text }) });
  if (!response.ok) { const data = await response.json().catch(() => ({})) as { message?: string }; throw new Error(data.message ?? "Could not keep it."); }
}
