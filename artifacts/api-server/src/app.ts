import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import friendRoutes from "./routes/friends";
import { registerRoutes } from "./legacy-routes";
import { logger } from "./lib/logger";
import groupRoutes from "./routes/groups";
import pushTokenRoutes from "./routes/push-tokens";
import { corsOrigin, createRateLimiter, enforceSameOrigin } from "./security";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
}));
app.use(enforceSameOrigin);
app.use(createRateLimiter({ windowMs: 60_000, max: 1000 }));
app.use("/api/login", createRateLimiter({ windowMs: 60_000, max: 60 }));
app.use("/api/register", createRateLimiter({ windowMs: 60_000, max: 20 }));
app.use("/api/refresh-token", createRateLimiter({ windowMs: 60_000, max: 60 }));
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: false, limit: "8mb" }));

app.use("/api", router);
registerRoutes(app);
app.use(groupRoutes);
app.use(friendRoutes);
app.use(pushTokenRoutes);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  if (error instanceof Error && error.message === "Origin is not allowed") {
    return res.status(403).json({ error: "Origin is not allowed" });
  }
  console.error("Unhandled request error:", error instanceof Error ? error.message : "unknown error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
