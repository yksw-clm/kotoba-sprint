import type { Env } from "./env";
export { RoomObject } from "./durable-objects/RoomObject";

const ROOM_PAGE_RE = /^\/rooms\/([a-zA-Z0-9_-]{3,64})\/?$/;
const ROOM_WEBSOCKET_RE = /^\/rooms\/([a-zA-Z0-9_-]{3,64})\/websocket\/?$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/rooms") {
      const roomId = createRoomId();
      return Response.json({ roomId, path: `/rooms/${roomId}` });
    }

    const websocketMatch = url.pathname.match(ROOM_WEBSOCKET_RE);
    if (websocketMatch) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected a WebSocket upgrade request.", { status: 426 });
      }

      const roomId = websocketMatch[1];
      const id = env.ROOM_OBJECT.idFromName(roomId);
      return env.ROOM_OBJECT.get(id).fetch(request);
    }

    if (request.method === "GET" && (url.pathname === "/" || ROOM_PAGE_RE.test(url.pathname))) {
      return fetchAssetOrIndex(request, env);
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found.", { status: 404 });
  },
};

function createRoomId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("");
}

function fetchAssetOrIndex(request: Request, env: Env): Response | Promise<Response> {
  if (env.ASSETS) return env.ASSETS.fetch(request);
  return new Response(
    `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#f7f4ec" />
    <title>ことばスプリント</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client/main.tsx"></script>
  </body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}
