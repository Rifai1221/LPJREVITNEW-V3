// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
app.use(express.json());
app.get("/healthz", (_req, res) => {
  res.status(200).send("OK");
});
app.get("/api/health", (_req, res) => {
  res.json({ status: "healthy", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
var distPath = path.resolve(__dirname, "dist");
app.use(express.static(distPath));
app.get("*", (_req, res) => {
  res.sendFile(path.resolve(distPath, "index.html"));
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Production server listening on port ${PORT}`);
});
