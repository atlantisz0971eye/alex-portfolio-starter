export async function headOK(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pickReachable(base: string[], versionSuffix: string = ""): Promise<string | null> {
  const candidates: string[] = [];
  for (const u of base) {
    candidates.push(u);
    if (versionSuffix) {
      candidates.push(`${u}${u.includes("?") ? "&" : "?"}v=${versionSuffix}`);
    }
  }
  for (const url of candidates) {
    if (await headOK(url)) return url;
  }
  return null;
}
