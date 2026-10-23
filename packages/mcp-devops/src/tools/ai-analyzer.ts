import fs from "fs/promises";
import path from "path";
import fetch from "node-fetch";

export interface EnvVarSpec {
  name: string;
  description: string;
  example?: string;
  required: boolean;
}

export interface AiAnalysisResult {
  isDeployable: boolean;
  rejectionReason: string | null;
  stack: string;
  framework: string;
  targetType: "service" | "project";
  language: "NODEJS" | "PYTHON" | "GO" | "DOCKERFILE";
  isWorker: boolean;
  recommendedPort: number;
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  requiredEnvVars: EnvVarSpec[];
  optionalEnvVars: EnvVarSpec[];
  generatedDockerfile?: string | null;
  explanation: string;
}

function getGeminiKeys(): string[] {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEY_6,
    process.env.GEMINI_API_KEY_7,
  ].filter(Boolean) as string[];

  return Array.from(new Set(keys));
}

let currentKeyIndex = 0;

/**
 * Invokes Gemini 3.5 Flash Lite with key rotation
 */
async function callGeminiFlashLite(prompt: string): Promise<string> {
  const keys = getGeminiKeys();
  if (keys.length === 0) {
    throw new Error("No Gemini API keys configured. Set GEMINI_API_KEY or GEMINI_API_KEY_1..7.");
  }

  let lastError: Error | null = null;
  const attempts = Math.min(keys.length, 5);

  for (let i = 0; i < attempts; i++) {
    const key = keys[currentKeyIndex % keys.length];
    currentKeyIndex++;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          }
        }),
      });

      if (!res.ok) {
        continue;
      }

      const data: any = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error("Gemini returned empty candidate output");
      }
      return text;
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error("Failed to contact Gemini Flash Lite across all configured API keys.");
}

/**
 * Inspects a workspace folder and analyzes it with Gemini 3.5 Flash Lite
 */
export async function analyzeWorkspaceWithAI(workspaceDir: string): Promise<AiAnalysisResult> {
  const root = path.resolve(workspaceDir);
  const filesInRoot: string[] = await fs.readdir(root).catch(() => [] as string[]);

  // 1. Read README
  let readme = "";
  const readmeCandidates = ["README.md", "readme.md", "README.rst", "README.txt", "README"];
  for (const candidate of readmeCandidates) {
    if (filesInRoot.includes(candidate)) {
      try {
        readme = await fs.readFile(path.join(root, candidate), "utf8");
        break;
      } catch {}
    }
  }

  // 2. Read package.json / requirements.txt / Dockerfile / .env.example
  let packageJsonStr = "";
  if (filesInRoot.includes("package.json")) {
    try {
      packageJsonStr = await fs.readFile(path.join(root, "package.json"), "utf8");
    } catch {}
  }

  let requirementsTxt = "";
  if (filesInRoot.includes("requirements.txt")) {
    try {
      requirementsTxt = await fs.readFile(path.join(root, "requirements.txt"), "utf8");
    } catch {}
  }

  let dockerfileStr = "";
  const dockerCandidate = filesInRoot.find(f => f.toLowerCase() === "dockerfile");
  if (dockerCandidate) {
    try {
      dockerfileStr = await fs.readFile(path.join(root, dockerCandidate), "utf8");
    } catch {}
  }

  let envExample = "";
  const envExampleCandidates = [".env.example", ".env.sample", ".env.template", ".env"];
  for (const cand of envExampleCandidates) {
    if (filesInRoot.includes(cand)) {
      try {
        envExample = await fs.readFile(path.join(root, cand), "utf8");
        break;
      } catch {}
    }
  }

  // 3. Other manifests (go.mod, Cargo.toml, pom.xml, build.gradle, composer.json, Gemfile, Spring Boot properties)
  const manifestFiles: Record<string, string> = {};
  const manifestNames = [
    "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts",
    "composer.json", "Gemfile", "pyproject.toml", "Pipfile", "Procfile",
    "src/main/resources/application.properties", "src/main/resources/application.yml", "src/main/resources/application.yaml",
    "application.properties", "application.yml", "application.yaml"
  ];
  for (const m of manifestNames) {
    try {
      const fullPath = path.join(root, m);
      const content = await fs.readFile(fullPath, "utf8").catch(() => null);
      if (content !== null) {
        manifestFiles[m] = content;
      }
    } catch {}
  }

  // 4. Construct Prompt
  let manifestsText = "";
  for (const [name, content] of Object.entries(manifestFiles)) {
    manifestsText += `\n--- ${name} ---\n${content.slice(0, 1500)}\n`;
  }

  const prompt = `
You are the Whizan Cloud Autonomous AI Repository Analyzer & System Guardrail (using gemini-3.5-flash-lite).
Your mission is to inspect the repository metadata and return a strict, definitive JSON deployment recommendation.

### SYSTEM GUARDRAIL POLICIES:
Whizan Cloud is a cloud platform for:
1. Backend APIs and Microservices (Node.js, Express, Fastify, NestJS, Python, FastAPI, Flask, Django, Go, Gin, Rust, Java, Spring Boot, PHP, Laravel, Ruby on Rails, C# .NET, Dockerfiles).
2. Background Queue Workers and Consumers (Celery, BullMQ, Kafka consumers, Redis subscribers, continuous background workers).
3. Frontend Web Applications (Next.js, React, Vite, Astro, Vue, Svelte, static web).

Whizan Cloud CANNOT and DOES NOT host the following non-deployable projects:
- Desktop GUI applications (PyQt, PySide, Tkinter, wxPython, Electron desktop client without web server, WPF, WinForms, Cocoa/Swift desktop).
- Mobile applications (iOS Xcode/Swift, Android native Kotlin/Java, Flutter mobile, React Native mobile apps without web export).
- Raw libraries, SDKs, or packages without a runnable server, worker, or web entrypoint (e.g. pure npm/pip package containing only helper functions).
- One-shot CLI tools or terminal scripts that run once, print output, and exit immediately.
- Operating system drivers, kernel modules, Arduino/Raspberry Pi hardware firmware.
- Malicious tools, cryptominers, fork bombs.

If the repository falls under ANY of the non-deployable categories:
- Set "isDeployable": false
- Set "rejectionReason": A polite, precise, and actionable explanation stating why Whizan Cloud cannot host this repository, specifying what kind of software was detected, and clarifying that Whizan Cloud hosts web services, backend APIs, background workers, and web apps.

If the repository IS deployable:
- Set "isDeployable": true
- Set "rejectionReason": null
- Select stack, framework, targetType:
  * "project" for ALL frontend & fullstack web applications (Next.js, React, Vite, Astro, Vue, Svelte, or any web app that includes a Dockerfile).
    CRITICAL NEXT.JS RULE: For Next.js projects with dynamic routes (e.g. /scans/[id]) or Server Actions, DO NOT recommend 'output: export' in next.config. Whizan natively hosts Next.js server runtimes and standalone servers.
    CRITICAL DOCKERFILE WEB APP RULE: If a web frontend/fullstack project provides its own Dockerfile, set targetType: "project" and language: "DOCKERFILE". Whizan will automatically build the Dockerfile and deploy it as a Web Project.
  * "service" for dedicated backend APIs, microservices, and background queue workers (FastAPI, Flask, Django, Express, NestJS, Go, Rust, Java, Celery, BullMQ, Kafka consumers).
- Set "language": "NODEJS" | "PYTHON" | "GO" | "DOCKERFILE".
  * If stack is Rust, Java, PHP, Ruby, .NET, or has a Dockerfile, set "language": "DOCKERFILE".
- "isWorker": true if it is a background consumer/worker without an HTTP listener; false if it serves HTTP.
- "recommendedPort": the port the service listens on (e.g. 8000, 3000, 5000, 8080). Set to 0 if "isWorker" is true.
- "installCommand": appropriate dependency install command.
- "buildCommand": build command if needed (e.g. "npm run build", "cargo build --release"), or "" if none.
- "startCommand": command to run the application binding to host 0.0.0.0 and port $PORT.
- "requiredEnvVars": list of mandatory environment variables found in README, .env.example, or code that the user MUST provide before deployment (e.g. DATABASE_URL, API_KEY, SECRET_KEY, REDIS_URL).
- "optionalEnvVars": list of optional environment variables.
- "generatedDockerfile": if stack is Rust, Java, PHP, Ruby, or requires a custom container and has no Dockerfile, supply a production-grade multi-stage Dockerfile string; otherwise null.
- "explanation": brief summary of what was detected.

### REPOSITORY DATA TO ANALYZE:
Files in repository:
${filesInRoot.slice(0, 60).join("\n") || "No file list provided"}

Files in repository root:
${filesInRoot.join(", ") || "None"}
Has index.html: ${filesInRoot.includes("index.html")}

README content:
${readme.slice(0, 8000) || "No README provided"}

Package.json:
${packageJsonStr.slice(0, 3000) || "None"}

Requirements.txt:
${requirementsTxt.slice(0, 2000) || "None"}

Dockerfile:
${dockerfileStr.slice(0, 2000) || "None"}

.env.example / .env:
${envExample.slice(0, 2000) || "None"}

Other manifests:
${manifestsText || "None"}

Respond strictly with valid JSON conforming to this schema:
{
  "isDeployable": boolean,
  "rejectionReason": string or null,
  "stack": string,
  "framework": string,
  "targetType": "service" or "project",
  "language": "NODEJS" or "PYTHON" or "GO" or "DOCKERFILE",
  "isWorker": boolean,
  "recommendedPort": number,
  "installCommand": string,
  "buildCommand": string,
  "startCommand": string,
  "requiredEnvVars": [
    { "name": string, "description": string, "example": string, "required": true }
  ],
  "optionalEnvVars": [
    { "name": string, "description": string, "example": string, "required": false }
  ],
  "generatedDockerfile": string or null,
  "explanation": string
}
`;

  try {
    const rawJson = await callGeminiFlashLite(prompt);
    const parsed = JSON.parse(rawJson);
    return sanitizeResult(parsed, filesInRoot, readme);
  } catch (err: any) {
    console.warn(`[AI Analyzer] Gemini error, using heuristic fallback: ${err.message}`);
    return localFallback(filesInRoot, readme, requirementsTxt, packageJsonStr);
  }
}

function sanitizeResult(parsed: any, files: string[], readme: string): AiAnalysisResult {
  const isDeployable = Boolean(parsed.isDeployable);
  const rejectionReason = parsed.rejectionReason || null;
  const stack = parsed.stack || "Node.js";
  const framework = parsed.framework || "Custom";
  const targetType = parsed.targetType === "project" ? "project" : "service";

  let language = parsed.language;
  if (!["NODEJS", "PYTHON", "GO", "DOCKERFILE"].includes(language)) {
    if (stack.toLowerCase().includes("python")) language = "PYTHON";
    else if (stack.toLowerCase().includes("go")) language = "GO";
    else if (["rust", "java", "php", "ruby", "c#", ".net"].some(s => stack.toLowerCase().includes(s))) {
      language = "DOCKERFILE";
    } else {
      language = "NODEJS";
    }
  }

  const isWorker = Boolean(parsed.isWorker);
  let recommendedPort = typeof parsed.recommendedPort === "number" ? parsed.recommendedPort : 8000;
  if (isWorker) recommendedPort = 0;

  return {
    isDeployable,
    rejectionReason,
    stack,
    framework,
    targetType,
    language: language as "NODEJS" | "PYTHON" | "GO" | "DOCKERFILE",
    isWorker,
    recommendedPort,
    installCommand: parsed.installCommand || (language === "PYTHON" ? "pip install -r requirements.txt" : "npm install"),
    buildCommand: parsed.buildCommand || "",
    startCommand: parsed.startCommand || (language === "PYTHON" ? "python main.py" : "npm start"),
    requiredEnvVars: Array.isArray(parsed.requiredEnvVars) ? parsed.requiredEnvVars : [],
    optionalEnvVars: Array.isArray(parsed.optionalEnvVars) ? parsed.optionalEnvVars : [],
    generatedDockerfile: parsed.generatedDockerfile || null,
    explanation: parsed.explanation || "Analyzed repository stack and structure.",
  };
}

function localFallback(files: string[], readme: string, req: string, pkgStr: string): AiAnalysisResult {
  const rLower = readme.toLowerCase();
  const reqLower = req.toLowerCase();

  // Guardrail check: Desktop GUI
  if (
    rLower.includes("pyqt") ||
    rLower.includes("tkinter") ||
    rLower.includes("wxpython") ||
    reqLower.includes("pyqt5") ||
    reqLower.includes("pyqt6") ||
    files.some(f => f.toLowerCase().endsWith(".ui"))
  ) {
    return {
      isDeployable: false,
      rejectionReason: "Whizan Cloud only hosts web services, backend APIs, background queue workers, and frontend web applications. Desktop GUI applications cannot be hosted because they require a graphical display server which is not available in the cloud environment.",
      stack: "Python GUI",
      framework: "PyQt / Tkinter",
      targetType: "service",
      language: "PYTHON",
      isWorker: false,
      recommendedPort: 0,
      installCommand: "",
      buildCommand: "",
      startCommand: "",
      requiredEnvVars: [],
      optionalEnvVars: [],
      explanation: "Desktop GUI application detected. Refusing deployment per Whizan System Guardrail policy.",
    };
  }

  // Static HTML Frontend Check
  if (!files.includes("package.json") && files.includes("index.html")) {
    return {
      isDeployable: true,
      rejectionReason: null,
      stack: "HTML / Static Web",
      framework: "Static HTML",
      targetType: "project",
      language: "NODEJS",
      isWorker: false,
      recommendedPort: 80,
      installCommand: "",
      buildCommand: "",
      startCommand: "",
      requiredEnvVars: [],
      optionalEnvVars: [],
      explanation: "Static HTML frontend with index.html detected. Deployed directly to Whizan Edge Router.",
    };
  }

  // Fallback heuristic detection
  const hasDocker = files.some(f => f.toLowerCase() === "dockerfile");
  const hasCargo = files.includes("Cargo.toml");
  const hasJava = files.includes("pom.xml") || files.includes("build.gradle");
  const hasGo = files.includes("go.mod");
  const hasPython = files.includes("requirements.txt") || files.includes("pyproject.toml");

  let language: "NODEJS" | "PYTHON" | "GO" | "DOCKERFILE" = "NODEJS";
  let stack = "Node.js";
  let startCommand = "npm start";
  let installCommand = "npm install";
  let buildCommand = "";
  let port = 8000;

  if (hasJava) {
    language = "DOCKERFILE";
    stack = "Java";
    port = 8080;
    buildCommand = files.includes("pom.xml") ? "mvn clean package -DskipTests" : "gradle build -x test";
    startCommand = "java -jar target/app.jar";
  } else if (hasCargo) {
    language = "DOCKERFILE";
    stack = "Rust";
    port = 8080;
    buildCommand = "cargo build --release";
    startCommand = "./target/release/server";
  } else if (hasDocker) {
    language = "DOCKERFILE";
    stack = "Docker";
  } else if (hasGo) {
    language = "GO";
    stack = "Go";
    installCommand = "go mod download";
    startCommand = "go run .";
  } else if (hasPython) {
    language = "PYTHON";
    stack = "Python";
    installCommand = "pip install -r requirements.txt";
    startCommand = "python main.py";
  }

  return {
    isDeployable: true,
    rejectionReason: null,
    stack,
    framework: "Custom",
    targetType: "service",
    language,
    isWorker: false,
    recommendedPort: port,
    installCommand,
    buildCommand,
    startCommand,
    requiredEnvVars: [],
    optionalEnvVars: [],
    explanation: `Locally inferred ${stack} project configuration.`,
  };
}
