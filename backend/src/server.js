import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { router } from "./routes/api.js";
import { startScheduler } from "./scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/api", router);

const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
app.use(express.static(frontendDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(frontendDist, "index.html"), (err) => {
    if (err) next();
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    ok: false,
    error: err.message || "Internal server error",
  });
});

app.listen(config.port, () => {
  console.log(
    `INE price tracker API on http://localhost:${config.port} (headless=${config.headless}, db=${config.supabaseUrl ? "supabase" : "local-json"})`
  );
  startScheduler().catch((err) => console.error("[scheduler]", err));
});
