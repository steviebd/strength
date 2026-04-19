import { cors } from "hono/cors";
import { Hono } from "hono";
import { createAuth, isDevAuthEnabled, type WorkerEnv } from "./auth";

type Variables = {
  user: ReturnType<typeof createAuth>["$Infer"]["Session"]["user"] | null;
  session: ReturnType<typeof createAuth>["$Infer"]["Session"]["session"] | null;
};

const app = new Hono<{ Bindings: WorkerEnv; Variables: Variables }>();

function isAllowedDevOrigin(origin: string) {
  return (
    origin.startsWith("strength://") ||
    /^exp:\/\/.+/i.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
    /^http:\/\/(?:10|192\.168|172\.(?:1[6-9]|2\d|3[0-1]))(?:\.\d{1,3}){2}(?::\d+)?$/i.test(origin)
  );
}

app.use(
  "/api/auth/*",
  cors({
    origin: (origin) => (isAllowedDevOrigin(origin) ? origin : null),
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    exposeHeaders: ["Set-Cookie"],
    credentials: true,
  }),
);

app.use("*", async (c, next) => {
  if (!isDevAuthEnabled(c.env)) {
    c.set("user", null);
    c.set("session", null);
    await next();
    return;
  }

  const requiresSession = c.req.path.startsWith("/api/auth/") || c.req.path === "/api/me";

  if (!requiresSession) {
    c.set("user", null);
    c.set("session", null);
    await next();
    return;
  }

  const auth = createAuth(c.env);
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);

  await next();
});

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    authMode: isDevAuthEnabled(c.env) ? "development" : "disabled",
  });
});

app.get("/api/me", (c) => {
  const user = c.get("user");
  const session = c.get("session");

  if (!user || !session) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  return c.json({ user, session });
});

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  if (!isDevAuthEnabled(c.env)) {
    return c.json(
      { message: "Authentication is intentionally disabled outside development right now." },
      403,
    );
  }

  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

export default app;
