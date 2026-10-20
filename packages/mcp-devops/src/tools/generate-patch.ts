export interface PatchRecommendation {
  issue: string;
  description: string;
  suggestedCode: string;
  filesToUpdate: string[];
}

export function generatePatch(params: {
  issue: "port_binding" | "cors_setup" | "health_check" | "package_scripts" | "frontend_api_url";
  framework?: string;
  backendUrl?: string;
  frontendOrigin?: string;
}): PatchRecommendation {
  const { issue, framework = "Express", backendUrl, frontendOrigin = "http://localhost:3000" } = params;

  switch (issue) {
    case "port_binding":
      return {
        issue: "port_binding",
        description: "Binds server to process.env.PORT and 0.0.0.0 for Docker networking compatibility.",
        suggestedCode:
          framework.toLowerCase().includes("python") || framework.toLowerCase().includes("fastapi")
            ? `import os\nimport uvicorn\n\nif __name__ == "__main__":\n    port = int(os.getenv("PORT", 8000))\n    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)`
            : `const PORT = process.env.PORT || 8000;\napp.listen(PORT, "0.0.0.0", () => {\n  console.log(\`Server listening on port \${PORT} (0.0.0.0)\`);\n});`,
        filesToUpdate: ["src/index.ts", "src/server.ts", "index.js", "server.js", "main.py"],
      };

    case "cors_setup":
      return {
        issue: "cors_setup",
        description: "Enables Cross-Origin Resource Sharing (CORS) with support for credentials and frontend domains.",
        suggestedCode: `import cors from "cors";\n\napp.use(cors({\n  origin: [\n    "${frontendOrigin}",\n    "https://whizan.cloud",\n    "https://dashboard.whizan.cloud",\n    /^https?:\\/\\/([a-z0-9-]+\\.)*whizan\\.cloud$/,\n    "http://localhost:3000",\n    /^https?:\\/\\/.*\\.web\\.app$/,\n    /^https?:\\/\\/.*\\.firebaseapp\\.com$/,\n    /^https?:\\/\\/.*\\.vercel\\.app$/\n  ],\n  credentials: true,\n}));`,
        filesToUpdate: ["src/index.ts", "src/server.ts", "index.js", "server.js"],
      };

    case "health_check":
      return {
        issue: "health_check",
        description: "Adds a lightweight GET /health endpoint for Docker container readiness checks.",
        suggestedCode: `app.get("/health", (req, res) => {\n  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });\n});`,
        filesToUpdate: ["src/index.ts", "src/server.ts", "index.js", "server.js"],
      };

    case "package_scripts":
      return {
        issue: "package_scripts",
        description: "Adds required 'build' and 'start' production scripts to package.json.",
        suggestedCode: `"scripts": {\n  "build": "tsc",\n  "start": "node dist/index.js"\n}`,
        filesToUpdate: ["package.json"],
      };

    case "frontend_api_url": {
      let effectiveBackendUrl = backendUrl;
      if (!effectiveBackendUrl) {
        effectiveBackendUrl = "https://<service-slug>.whizan.cloud";
      } else if (effectiveBackendUrl.includes("nip.io") && effectiveBackendUrl.startsWith("https://")) {
        effectiveBackendUrl = effectiveBackendUrl.replace(/^https:\/\//i, "http://");
      }
      return {
        issue: "frontend_api_url",
        description: "Updates frontend configuration to point to the newly deployed Whizan backend URL (HTTPS with Cloudflare Wildcard SSL).",
        suggestedCode: `// .env.production or frontend config:\nVITE_API_URL="${effectiveBackendUrl}"\nNEXT_PUBLIC_API_URL="${effectiveBackendUrl}"`,
        filesToUpdate: [".env", ".env.production", "src/config.ts", "src/api.ts"],
      };
    }

    default:
      return {
        issue,
        description: "Generic hosting configuration update.",
        suggestedCode: "",
        filesToUpdate: [],
      };
  }
}
