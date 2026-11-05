export function apiBaseUrl(platform: string, configured?: string): string {
  // Metro proxies /api during local web development. Exported web builds must
  // be hosted with a reverse proxy for /api on the same origin.
  if (platform === "web") return "";
  const value = configured?.trim() || (platform === "android" ? "http://10.0.2.2:3000" : "http://127.0.0.1:3000");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("Configura EXPO_PUBLIC_API_URL con la dirección HTTP o HTTPS del servidor, sin credenciales ni parámetros.");
  }
  return value.replace(/\/$/, "");
}
