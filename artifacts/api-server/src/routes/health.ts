import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    const sessionReady = req.app.locals.sessionReady as Promise<void> | undefined;
    if (sessionReady) await sessionReady;
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  } catch (error) {
    console.error("Health check failed:", error instanceof Error ? error.message : "unknown error");
    res.status(503).json({ status: "degraded" });
  }
});

export default router;
