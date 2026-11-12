export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/)
    .filter((t) => t.length > 1);
}
