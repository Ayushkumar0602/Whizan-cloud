const express = require("express");
const app = express();
const PORT = process.env.PORT || 8000;

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "🚀 Hello from Whizan CLI Deployment!",
    deployedVia: "@whizan/cli v1.0.0",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy", uptime: process.uptime() });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT} (0.0.0.0)`);
});
