// Mobile Maps URLs support three intermediate waypoints reliably.
export function routeLegs(stops: string[]): { stops: string[]; url: string }[] {
  const addresses = stops.map(s => s.trim()).filter(Boolean);
  const legs: { stops: string[]; url: string }[] = [];
  for (let i = 0; i < addresses.length; i += 4) {
    const chunk = addresses.slice(i, i + 4);
    const destination = chunk.at(-1);
    if (!destination) continue;
    const params = new URLSearchParams({ api: "1", destination, travelmode: "driving" });
    if (i > 0) params.set("origin", addresses[i - 1]);
    if (chunk.length > 1) params.set("waypoints", chunk.slice(0, -1).join("|"));
    legs.push({ stops: chunk, url: `https://www.google.com/maps/dir/?${params}` });
  }
  return legs;
}