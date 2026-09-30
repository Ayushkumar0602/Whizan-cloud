import path from "node:path";

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

export interface RepoAnalysisInput {
  readme?: string;
  fileList?: string[];
  packageJson?: any;
  requirementsTxt?: string;
  dockerfile?: string;
  envExample?: string;
  manifestFiles?: Record<string, string>; // e.g. { "Cargo.toml": "...", "go.mod": "..." }
}

function getGeminiKeys(): string[] {
  const keys = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEY_6,
    process.env.GEMINI_API_KEY_7,
    process.env.GEMINI_API_KEY,
    "AQ.Ab8RN6Jey2BrJP1cYOJdhuvK7BvOVUi_haNSGUEEKp4JioHpZQ",
    "AQ.Ab8RN6LqJFX-KBWqb-ZozXjzh0GmM3WaTWAb8sexKCn-bgsd7Q"
  ].filter(Boolean) as string[];

  // Return unique keys
  return Array.from(new Set(keys));
}

let currentKeyIndex = 0;

/**
 * Call Gemini 3.5 Flash Lite with automatic key rotation and strict JSON parsing
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
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(`[Gemini Flash Lite] Key attempt failed (${res.status}):`, errText.slice(0, 150));
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
      console.warn(`[Gemini Flash Lite] Attempt error: ${err.message}`);
    }
  }

  throw lastError || new Error("Failed to contact Gemini Flash Lite across all configured API keys.");
}

/**
 * Analyzes repository structure, README, package manifests, and applies AI guardrails
 */
export async function analyzeRepositoryWithAI(input: RepoAnalysisInput): Promise<AiAnalysisResult> {
  const fileListSnippet = (input.fileList || []).slice(0, 80).join("\n");
  const readmeSnippet = (input.readme || "").slice(0, 10000);
  const pkgSnippet = input.packageJson
    ? typeof input.packageJson === "string"
      ? input.packageJson.slice(0, 4000)
      : JSON.stringify(input.packageJson, null, 2).slice(0, 4000)
    : "";
  const reqSnippet = (input.requirementsTxt || "").slice(0, 3000);
  const dockerfileSnippet = (input.dockerfile || "").slice(0, 3000);
  const envExampleSnippet = (input.envExample || "").slice(0, 2000);

  let manifestsText = "";
  if (input.manifestFiles) {
    for (const [name, content] of Object.entries(input.manifestFiles)) {
      manifestsText += `\n--- ${name} ---\n${content.slice(0, 1500)}\n`;
    }
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
- Select stack, framework, targetType ("service" for backends/workers, "project" for frontends/fullstack).
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
${fileListSnippet || "No file list provided"}

README content:
${readmeSnippet || "No README provided"}

Package.json:
${pkgSnippet || "None"}

Requirements.txt / Python manifests:
${reqSnippet || "None"}

Dockerfile:
${dockerfileSnippet || "None"}

.env.example / .env:
${envExampleSnippet || "None"}

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
    return sanitizeAnalysisResult(parsed, input);
  } catch (err: any) {
    console.warn(`[Gemini AI Analyzer] Falling back to robust local heuristic: ${err.message}`);
    return localHeuristicFallback(input);
  }
}

/**
 * Sanitize and enforce defaults on the AI output
 */
function sanitizeAnalysisResult(parsed: any, input: RepoAnalysisInput): AiAnalysisResult {
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

/**
 * Robust local heuristic fallback if AI API is temporarily unreachable
 */
function localHeuristicFallback(input: RepoAnalysisInput): AiAnalysisResult {
  const files = input.fileList || [];
  const readme = (input.readme || "").toLowerCase();
  const req = (input.requirementsTxt || "").toLowerCase();

  // Guardrail check: Desktop GUI
  if (
    readme.includes("pyqt") ||
    readme.includes("tkinter") ||
    readme.includes("wxpython") ||
    req.includes("pyqt5") ||
    req.includes("pyqt6") ||
    req.includes("pyside") ||
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

  // Guardrail check: Mobile
  if (
    files.some(f => f.includes("ios/") || f.includes("android/") || f.endsWith(".xcodeproj") || f.endsWith(".xcworkspace")) &&
    !files.some(f => f.includes("pages") || f.includes("src/App") || f.includes("server"))
  ) {
    return {
      isDeployable: false,
      rejectionReason: "Whizan Cloud only hosts web services, backend APIs, background queue workers, and frontend web applications. Native mobile applications (iOS/Android) cannot be deployed.",
      stack: "Mobile",
      framework: "Native Mobile",
      targetType: "project",
      language: "NODEJS",
      isWorker: false,
      recommendedPort: 0,
      installCommand: "",
      buildCommand: "",
      startCommand: "",
      requiredEnvVars: [],
      optionalEnvVars: [],
      explanation: "Native mobile application detected. Refusing deployment per Whizan System Guardrail policy.",
    };
  }

  // Standard heuristic detection
  const hasDocker = files.some(f => f.toLowerCase() === "dockerfile") || Boolean(input.dockerfile);
  const hasGo = files.some(f => f === "go.mod");
  const hasPython = files.some(f => f === "requirements.txt" || f === "pyproject.toml" || f.endsWith(".py"));
  const hasCargo = files.some(f => f === "Cargo.toml");
  const hasJava = files.some(f => f === "pom.xml" || f === "build.gradle");

  let language: "NODEJS" | "PYTHON" | "GO" | "DOCKERFILE" = "NODEJS";
  let stack = "Node.js";
  let framework = "Custom";
  let startCommand = "npm start";
  let installCommand = "npm install";
  let buildCommand = "";
  let port = 8000;

  if (hasDocker) {
    language = "DOCKERFILE";
    stack = "Docker";
  } else if (hasCargo) {
    language = "DOCKERFILE";
    stack = "Rust";
    buildCommand = "cargo build --release";
    startCommand = "./target/release/server";
  } else if (hasJava) {
    language = "DOCKERFILE";
    stack = "Java";
    buildCommand = "mvn package";
    startCommand = "java -jar target/app.jar";
  } else if (hasGo) {
    language = "GO";
    stack = "Go";
    installCommand = "go mod download";
    startCommand = "go run .";
  } else if (hasPython) {
    language = "PYTHON";
    stack = "Python";
    installCommand = "pip install -r requirements.txt";
    if (files.some(f => f === "manage.py") || readme.includes("django")) {
      framework = "Django";
      startCommand = `python manage.py runserver 0.0.0.0:${port}`;
    } else if (req.includes("fastapi") || readme.includes("fastapi")) {
      framework = "FastAPI";
      startCommand = `uvicorn main:app --host 0.0.0.0 --port ${port}`;
    } else if (req.includes("flask") || readme.includes("flask")) {
      framework = "Flask";
      startCommand = `python app.py`;
    } else {
      startCommand = `python main.py`;
    }
  }

  return {
    isDeployable: true,
    rejectionReason: null,
    stack,
    framework,
    targetType: "service",
    language,
    isWorker: false,
    recommendedPort: port,
    installCommand,
    buildCommand: "",
    startCommand,
    requiredEnvVars: [],
    optionalEnvVars: [],
    explanation: `Locally inferred ${stack} (${framework}) project configuration.`,
  };
}
