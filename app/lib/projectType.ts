const PROJECT_TYPE_MAP: Record<string, string> = {
  "fitting-reality": "Interactive Installation",
  "electromagnetic-decay": "Audio-Reactive Installation",
  "dys-utopia": "Interactive Instantiation Model",
  "bloom-system": "Experimental Imaging System",
};

export function getProjectTypeLabel(slug: string): string {
  return PROJECT_TYPE_MAP[slug] ?? "";
}
