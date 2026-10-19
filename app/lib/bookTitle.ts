/** The name to show for a book: its real title when known, otherwise the file name without its extension. */
export const displayTitle = (doc: { name: string; title?: string }) => doc.title?.trim() || doc.name.replace(/\.(pdf|txt|md|html?)$/i, "");
