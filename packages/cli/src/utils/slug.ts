// ─── Whizan Cloud CLI — Slug Utilities ───────────────────────────────────────

/**
 * Convert a project name to a URL-safe slug
 * "My Awesome API" → "my-awesome-api"
 * "my_project 2.0" → "my-project-2-0"
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")  // Remove special chars
    .replace(/[\s_]+/g, "-")        // Spaces/underscores to hyphens
    .replace(/-+/g, "-")            // Collapse multiple hyphens
    .replace(/^-|-$/g, "")          // Trim leading/trailing hyphens
    .slice(0, 63);                  // Max DNS label length
}

/**
 * Append a random suffix to a slug for uniqueness
 * "my-api" → "my-api-x7k2"
 */
export function slugWithSuffix(base: string): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  const trimmed = base.slice(0, 58); // Leave room for suffix
  return `${trimmed}-${suffix}`;
}
