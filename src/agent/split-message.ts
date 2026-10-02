const DISCORD_CONTENT_LIMIT = 2000;

export function splitDiscordContent(
  text: string,
  limit = DISCORD_CONTENT_LIMIT
): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return ['(sin texto)'];
  if (trimmed.length <= limit) return [trimmed];

  const chunks: string[] = [];
  let rest = trimmed;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit * 0.5) cut = limit;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) chunks.push(rest);
  return chunks;
}
