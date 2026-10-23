import Docker from "dockerode";
import path from "path";
import fs from "fs/promises";
import net from "net";
import { spawn } from "child_process";

export interface ServiceBuildJob {
  deploymentId: string;
  serviceId: string;
  repoUrl: string;
  branch: string;
  language: string;
  rootDir: string;
  installCommand: string;
  startCommand: string;
  internalPort: number;
  slug: string;
  isWorker?: boolean;
  autoSleep?: boolean;
  instanceType?: string;
  cpuLimit?: number;
  memoryLimit?: number;
}

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

// Tuned for 2 vCPU / 4 GB RAM VMs:
// Defaults to 1.0 vCPU (guaranteeing 50% CPU headroom for OS, Edge Router, Postgres, Redis)
// and 768 MB RAM (guaranteeing >3.2 GB RAM headroom for host)
const DEPLOY_BURST_CPU = parseFloat(process.env.DEPLOY_BURST_CPU || "1.0");
const DEPLOY_BURST_MEM_MB = parseInt(process.env.DEPLOY_BURST_MEM_MB || "768", 10);

export class ServiceRunner {
  
  /**
   * Stops and removes all service containers matching this slug
   */
  async stopService(slug: string): Promise<void> {
    try {
      const containers = await docker.listContainers({ all: true }).catch(() => []);
      const matches = containers.filter((c) =>
        c.Names?.some((n) => n === `/service-${slug}` || n.startsWith(`/service-${slug}-`))
      );
      for (const info of matches) {
        try {
          const container = docker.getContainer(info.Id);
          if (info.State === "running") {
            await container.stop({ t: 2 }).catch(() => {});
          }
          await container.remove({ force: true }).catch(() => {});
        } catch {}
      }
    } catch (err: any) {
      console.error(`Failed to stop service containers for ${slug}:`, err);
    }
  }

  /**
   * Starts a service container with Zero-Downtime Blue/Green strategy.
   * Keeps existing container running until new container passes health check.
   */
  async startService(
    job: ServiceBuildJob,
    buildDir: string,
    envVars: Record<string, string>,
    onLog: (line: string) => Promise<void>
  ): Promise<{ hostPort: number; containerName: string }> {
    const shortId = job.deploymentId.slice(0, 8);
    const containerName = `service-${job.slug}-${shortId}`;

    // 1. Resolve root directory & verify if folder exists
    let cleanRootDir = job.rootDir && job.rootDir !== "." ? job.rootDir.replace(/^\/+|\/+$/g, "") : "";
    if (cleanRootDir) {
      const fullSubPath = path.join(buildDir, cleanRootDir);
      try {
        const stat = await fs.stat(fullSubPath);
        if (!stat.isDirectory()) {
          await onLog(`⚠️ Root directory '${cleanRootDir}' is not a directory. Falling back to repository root.`);
          cleanRootDir = "";
        }
      } catch {
        await onLog(`⚠️ Root directory '${cleanRootDir}' was not found in cloned repository. Falling back to repository root.`);
        cleanRootDir = "";
      }
    }
    const workingDir = cleanRootDir ? `/app/${cleanRootDir}` : "/app";
    const hostWorkDir = cleanRootDir ? path.join(buildDir, cleanRootDir) : buildDir;

    // 2. Check for Dockerfile or auto-synthesize one for any runtime stack
    const filesInWorkDir = await fs.readdir(hostWorkDir).catch(() => [] as string[]);
    let hasDockerfile = filesInWorkDir.some(f => f.toLowerCase() === "dockerfile");
    const isJavaProject = job.language === "JAVA" || filesInWorkDir.includes("pom.xml") || filesInWorkDir.includes("build.gradle") || filesInWorkDir.includes("build.gradle.kts");

    if (!hasDockerfile) {
      await this.writeDockerignore(hostWorkDir);

      const hasPackageJson = filesInWorkDir.includes("package.json");
      const hasCargo = filesInWorkDir.includes("Cargo.toml");
      const hasGoMod = filesInWorkDir.includes("go.mod");
      const hasMaven = filesInWorkDir.includes("pom.xml");
      const hasGradle = filesInWorkDir.includes("build.gradle") || filesInWorkDir.includes("build.gradle.kts");
      const hasPythonManifest =
        filesInWorkDir.includes("requirements.txt") ||
        filesInWorkDir.includes("pyproject.toml") ||
        filesInWorkDir.includes("Pipfile") ||
        filesInWorkDir.includes("manage.py");
      const hasComposer = filesInWorkDir.includes("composer.json");
      const hasGemfile = filesInWorkDir.includes("Gemfile");
      const hasDotnet = filesInWorkDir.some(f => f.endsWith(".csproj") || f.endsWith(".sln"));

      // Priority 1: Explicit language selection from database/job
      // Priority 2: Primary package manifests (package.json, Cargo.toml, go.mod, requirements.txt, etc.)
      // Priority 3: Fallback source file extensions (only when no package manifest is found)

      const isNode =
        job.language === "NODEJS" ||
        (hasPackageJson && job.language !== "PYTHON" && job.language !== "GO" && job.language !== "RUST") ||
        (!job.language && hasPackageJson);

      const isPython =
        !isNode &&
        (job.language === "PYTHON" ||
          (hasPythonManifest && !hasPackageJson) ||
          (job.language !== "NODEJS" && hasPythonManifest));

      const isGo =
        !isNode &&
        !isPython &&
        (job.language === "GO" || (hasGoMod && !hasPackageJson));

      const isRust =
        !isNode &&
        !isPython &&
        !isGo &&
        (job.language === "RUST" || (hasCargo && !hasPackageJson));

      const isJava =
        !isNode &&
        !isPython &&
        !isGo &&
        !isRust &&
        (job.language === "JAVA" || ((hasMaven || hasGradle) && !hasPackageJson));

      const isPhp =
        !isNode &&
        !isPython &&
        !isGo &&
        !isRust &&
        !isJava &&
        (job.language === "PHP" || (hasComposer && !hasPackageJson));

      const isRuby =
        !isNode &&
        !isPython &&
        !isGo &&
        !isRust &&
        !isJava &&
        !isPhp &&
        (job.language === "RUBY" || (hasGemfile && !hasPackageJson));

      const isDotnet =
        !isNode &&
        !isPython &&
        !isGo &&
        !isRust &&
        !isJava &&
        !isPhp &&
        !isRuby &&
        (job.language === "DOTNET" || (hasDotnet && !hasPackageJson));

      if (isNode) {
        await onLog("🟢 Node.js project detected. Running with native high-performance Node.js runtime...");
        // Node.js uses Whizan's native node:20-slim execution engine without Dockerfile build overhead
        hasDockerfile = false;
      } else if (isPython) {
        await onLog("🐍 Python project detected. Synthesizing zero-config production Python Dockerfile...");
        await this.writePythonDockerfile(hostWorkDir, job.internalPort, job.startCommand, filesInWorkDir);
        hasDockerfile = true;
      } else if (isGo) {
        await onLog("🐹 Go project detected. Synthesizing multi-stage Go Dockerfile...");
        await this.writeGoDockerfile(hostWorkDir, job.internalPort, job.startCommand, filesInWorkDir);
        hasDockerfile = true;
      } else if (isRust) {
        await onLog("🦀 Rust project detected (Cargo.toml). Synthesizing production Rust Dockerfile...");
        await this.writeRustDockerfile(hostWorkDir, job.internalPort);
        hasDockerfile = true;
      } else if (isJava) {
        const javaVersion = await this.detectJavaVersion(hostWorkDir);
        await onLog(`☕ Detected Java version from project manifest: ${javaVersion}`);

        const springPort = await this.detectSpringBootPort(hostWorkDir);
        if (springPort && springPort !== job.internalPort) {
          await onLog(`☕ Detected Spring Boot server.port=${springPort} in application configuration.`);
        }

        if (hasGradle) {
          await onLog(`☕ Java / Gradle project detected. Synthesizing OpenJDK ${javaVersion} Dockerfile...`);
          await this.writeGradleDockerfile(hostWorkDir, job.internalPort, javaVersion);
        } else {
          await onLog(`☕ Java / Maven project detected (pom.xml). Synthesizing OpenJDK ${javaVersion} Dockerfile...`);
          await this.writeMavenDockerfile(hostWorkDir, job.internalPort, javaVersion);
        }
        hasDockerfile = true;
      } else if (isPhp) {
        await onLog("🐘 PHP project detected. Synthesizing PHP Dockerfile...");
        await this.writePhpDockerfile(hostWorkDir, job.internalPort);
        hasDockerfile = true;
      } else if (isRuby) {
        await onLog("💎 Ruby project detected. Synthesizing Ruby Dockerfile...");
        await this.writeRubyDockerfile(hostWorkDir, job.internalPort);
        hasDockerfile = true;
      } else if (isDotnet) {
        await onLog("🔷 .NET / C# project detected. Synthesizing .NET 8 Dockerfile...");
        await this.writeDotnetDockerfile(hostWorkDir, job.internalPort);
        hasDockerfile = true;
      } else if (filesInWorkDir.some(f => f.endsWith(".js") || f.endsWith(".ts") || f.endsWith(".mjs"))) {
        // Fallback for manifest-less JavaScript/TypeScript script
        await onLog("🟢 Node.js script detected. Running with native high-performance Node.js runtime...");
        hasDockerfile = false;
      } else if (filesInWorkDir.some(f => f.endsWith(".py"))) {
        // Fallback for manifest-less Python script
        await onLog("🐍 Python project detected. Synthesizing zero-config production Python Dockerfile...");
        await this.writePythonDockerfile(hostWorkDir, job.internalPort, job.startCommand, filesInWorkDir);
        hasDockerfile = true;
      } else if (filesInWorkDir.some(f => f.endsWith(".go"))) {
        await onLog("🐹 Go project detected. Synthesizing multi-stage Go Dockerfile...");
        await this.writeGoDockerfile(hostWorkDir, job.internalPort, job.startCommand, filesInWorkDir);
        hasDockerfile = true;
      } else if (filesInWorkDir.some(f => f.endsWith(".php"))) {
        await onLog("🐘 PHP project detected. Synthesizing PHP Dockerfile...");
        await this.writePhpDockerfile(hostWorkDir, job.internalPort);
        hasDockerfile = true;
      } else {
        await onLog("⚡ Synthesizing universal backend container Dockerfile...");
        await this.writeUniversalDockerfile(hostWorkDir, job.internalPort, job.startCommand);
        hasDockerfile = true;
      }
    }

    let image = "node:20-slim";
    let isCustomImage = false;

    if (hasDockerfile) {
      // Build Dockerfile
      const builtImageTag = `service-img-${job.slug}-${shortId}`.toLowerCase();
      await onLog(`🐳 Building Docker image '${builtImageTag}'...`);
      await this.buildDockerImage(hostWorkDir, builtImageTag, onLog);
      image = builtImageTag;
      isCustomImage = true;
      await onLog(`✓ Docker image '${builtImageTag}' built successfully.`);
    } else {
      if (job.language === "PYTHON") {
        image = "python:3.11-slim";
        await this.ensureImage(image, onLog);
      } else if (job.language === "GO") {
        image = "golang:1.21-alpine";
        await this.ensureImage(image, onLog);
      } else {
        image = "node:20-slim";
        await this.ensureImage(image, onLog);
      }
    }

    // 3. Find a free host port for the new container (if HTTP service)
    const isWorker = Boolean(job.isWorker) || job.internalPort <= 0;
    const hostPort = isWorker ? 0 : await this.findFreePort();

    // 4. Intelligent runtime command adjustments (Python, Node, Go)
    let effectiveInstallCommand = job.installCommand || "";
    let effectiveStartCommand = job.startCommand || "";
    let detectedModule: string | null = null;

    if (!isCustomImage) {
      if (job.language === "PYTHON") {
        const candidateFiles = ["main.py", "app.py", "server.py", "wsgi.py", "index.py"];
        let isFlask = false;
        let isFastApi = false;
        const isDjango = filesInWorkDir.includes("manage.py");

        for (const fileName of candidateFiles) {
          try {
            const filePath = path.join(hostWorkDir, fileName);
            const content = await fs.readFile(filePath, "utf-8");
            if (content.includes("Flask(") || content.includes("from flask import") || content.includes("import flask")) {
              isFlask = true;
              detectedModule = fileName.replace(/\.py$/, "");
              break;
            }
            if (content.includes("FastAPI(") || content.includes("from fastapi import")) {
              isFastApi = true;
              detectedModule = fileName.replace(/\.py$/, "");
              break;
            }
          } catch {}
        }

        // Install C-compilers / dev headers quietly if psycopg2 or cffi are present in requirements
        const reqContent = await fs.readFile(path.join(hostWorkDir, "requirements.txt"), "utf8").catch(() => "");
        const needsBuildTools = /psycopg|cffi|cryptography|numpy|pillow|scipy/i.test(reqContent);
        let preInstall = needsBuildTools
          ? "apt-get update -qq && apt-get install -y -qq --no-install-recommends gcc python3-dev libpq-dev >/dev/null 2>&1 || true; "
          : "";

        // Poetry / Pipenv support
        if (filesInWorkDir.includes("pyproject.toml") || filesInWorkDir.includes("poetry.lock")) {
          effectiveInstallCommand = `${preInstall}pip install poetry --quiet && poetry config virtualenvs.create false && poetry install --no-interaction || pip install -r requirements.txt || true`;
        } else if (!effectiveInstallCommand || effectiveInstallCommand === "pip install -r requirements.txt") {
          effectiveInstallCommand = `${preInstall}if [ -f requirements.txt ]; then pip install -r requirements.txt; else echo 'No requirements.txt found, skipping pip install'; fi`;
        } else {
          effectiveInstallCommand = `${preInstall}${effectiveInstallCommand}`;
        }

        // Auto-heal legacy dependencies or missing framework
        effectiveInstallCommand += ` && (python -c "import flask" 2>/dev/null || (python -c "import flask" 2>&1 | grep -E "ImportError|No module named" >/dev/null && echo "⚡ Auto-resolving Python framework dependencies & legacy compatibility..." && pip install -U "flask>=3.0" "werkzeug>=3.0" "jinja2>=3.0" --quiet) || true)`;

        if (isFastApi) {
          effectiveInstallCommand += ` && (python -c "import fastapi" 2>/dev/null || pip install fastapi uvicorn --quiet || true)`;
        }

        if (isDjango) {
          effectiveInstallCommand += ` && (python -c "import django" 2>/dev/null || pip install django --quiet || true)`;
        }

        // Start command adjustments
        const isDefaultStart = !effectiveStartCommand || 
          effectiveStartCommand === "python main.py" || 
          effectiveStartCommand === "python3 main.py" ||
          effectiveStartCommand === "python app.py" ||
          effectiveStartCommand === "python3 app.py" ||
          effectiveStartCommand === "npm start";

        if (isDjango && isDefaultStart) {
          effectiveStartCommand = `python manage.py runserver 0.0.0.0:${job.internalPort}`;
          await onLog(`💡 Django app detected (manage.py). Running with 'python manage.py runserver 0.0.0.0:${job.internalPort}'.`);
        } else if (isFlask && detectedModule && isDefaultStart) {
          effectiveStartCommand = `python -m flask --app ${detectedModule} run --host 0.0.0.0 --port ${job.internalPort}`;
          await onLog(`💡 Flask app detected in ${detectedModule}.py. Running with Flask CLI on 0.0.0.0:${job.internalPort}.`);
        } else if (isFastApi && detectedModule && isDefaultStart) {
          effectiveStartCommand = `python -m uvicorn ${detectedModule}:app --host 0.0.0.0 --port ${job.internalPort}`;
          await onLog(`💡 FastAPI app detected in ${detectedModule}.py. Running with Uvicorn on 0.0.0.0:${job.internalPort}.`);
        }
      } else if (
        job.language === "NODEJS" ||
        filesInWorkDir.includes("package.json") ||
        (!job.language && !isCustomImage)
      ) {
        // Check if package.json has a build script (TypeScript, NestJS, etc.)
        try {
          const pkgRaw = await fs.readFile(path.join(hostWorkDir, "package.json"), "utf8");
          const pkg = JSON.parse(pkgRaw);
          const hasBuildScript = Boolean(pkg.scripts?.build);
          
          if (filesInWorkDir.includes("pnpm-lock.yaml")) {
            effectiveInstallCommand = "npm install -g pnpm && pnpm install";
            if (hasBuildScript && !effectiveInstallCommand.includes("build")) {
              effectiveInstallCommand += " && pnpm run build";
            }
          } else if (filesInWorkDir.includes("yarn.lock")) {
            effectiveInstallCommand = "yarn install";
            if (hasBuildScript && !effectiveInstallCommand.includes("build")) {
              effectiveInstallCommand += " && yarn build";
            }
          } else {
            if (!effectiveInstallCommand) effectiveInstallCommand = "npm install";
            if (hasBuildScript && !effectiveInstallCommand.includes("build")) {
              effectiveInstallCommand += " && npm run build";
            }
          }

          if (!effectiveStartCommand || effectiveStartCommand.trim() === "" || effectiveStartCommand === "npm start") {
            if (pkg.scripts?.start) {
              effectiveStartCommand = "npm start";
            } else if (filesInWorkDir.includes("server.js")) {
              effectiveStartCommand = "node server.js";
            } else if (filesInWorkDir.includes("index.js")) {
              effectiveStartCommand = "node index.js";
            } else if (filesInWorkDir.includes("app.js")) {
              effectiveStartCommand = "node app.js";
            } else {
              effectiveStartCommand = "npm start";
            }
          }
        } catch {
          if (!effectiveInstallCommand) effectiveInstallCommand = "npm install";
          if (!effectiveStartCommand || effectiveStartCommand.trim() === "") {
            effectiveStartCommand = "npm start";
          }
        }
      } else if (job.language === "GO") {
        if (!effectiveInstallCommand && filesInWorkDir.includes("go.mod")) {
          effectiveInstallCommand = "go mod download";
        }
        if (!effectiveStartCommand || effectiveStartCommand === "npm start") {
          effectiveStartCommand = "go run .";
        }
      }
    }

    // 5. Construct the container run command
    let cmd: string[] | undefined;
    if (isCustomImage) {
      // For Dockerfiles, if user specified custom start command and it's not a dummy placeholder, execute it
      if (
        job.startCommand &&
        job.startCommand.trim() !== "" &&
        job.startCommand !== "npm start" &&
        job.startCommand !== "python main.py"
      ) {
        cmd = ["sh", "-c", job.startCommand];
      } else {
        // Let Docker use the image's CMD / ENTRYPOINT
        cmd = undefined;
      }
    } else {
      cmd = [
        "sh",
        "-c",
        `set -e && if [ ! -f .hostify_installed ]; then echo "--- Installing Dependencies ---" && ${effectiveInstallCommand} && touch .hostify_installed; fi && echo "--- Starting Service ---" && ${effectiveStartCommand}`
      ];
    }

    const env = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);
    env.push(`PORT=${job.internalPort}`);
    env.push(`HOSTNAME=0.0.0.0`);
    env.push(`HOST=0.0.0.0`);
    env.push(`SERVER_PORT=${job.internalPort}`);
    env.push(`SERVER_ADDRESS=0.0.0.0`);
    env.push(`UVICORN_PORT=${job.internalPort}`);
    env.push(`FLASK_RUN_PORT=${job.internalPort}`);

    if (isJavaProject) {
      env.push(`JAVA_TOOL_OPTIONS=-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0`);

      // Automatic Spring Boot Datasource Mapping from DATABASE_URL
      const dbUrl = envVars["DATABASE_URL"] || envVars["POSTGRES_URL"];
      if (dbUrl && !envVars["SPRING_DATASOURCE_URL"]) {
        try {
          const parsed = new URL(dbUrl);
          const protocol = parsed.protocol.replace(":", "");
          const host = parsed.hostname;
          const port = parsed.port || (protocol.includes("postgres") ? "5432" : "3306");
          const dbName = parsed.pathname.replace(/^\//, "");
          const username = decodeURIComponent(parsed.username || "");
          const password = decodeURIComponent(parsed.password || "");

          if (protocol.includes("postgres")) {
            env.push(`SPRING_DATASOURCE_URL=jdbc:postgresql://${host}:${port}/${dbName}`);
            env.push(`SPRING_DATASOURCE_DRIVER_CLASS_NAME=org.postgresql.Driver`);
          } else if (protocol.includes("mysql")) {
            env.push(`SPRING_DATASOURCE_URL=jdbc:mysql://${host}:${port}/${dbName}`);
            env.push(`SPRING_DATASOURCE_DRIVER_CLASS_NAME=com.mysql.cj.jdbc.Driver`);
          }

          if (username && !envVars["SPRING_DATASOURCE_USERNAME"]) {
            env.push(`SPRING_DATASOURCE_USERNAME=${username}`);
          }
          if (password && !envVars["SPRING_DATASOURCE_PASSWORD"]) {
            env.push(`SPRING_DATASOURCE_PASSWORD=${password}`);
          }
        } catch {}
      }
    }

    if (job.language === "PYTHON") {
      env.push(`PYTHONUNBUFFERED=1`);
      env.push(`FLASK_APP=${detectedModule || "main"}.py`);
      env.push(`FLASK_RUN_HOST=0.0.0.0`);
    }

    // Compute runtime resource allocation
    const isSpinDown = Boolean(job.autoSleep);
    const runtimeCpuQuota = isSpinDown ? 0.1 : (job.cpuLimit || 0.5);
    const runtimeMemoryQuotaMB = isSpinDown ? 512 : (job.memoryLimit || 512);

    const runtimeNanoCpus = Math.round(runtimeCpuQuota * 1_000_000_000);
    const runtimeMemoryBytes = runtimeMemoryQuotaMB * 1024 * 1024;

    const burstNanoCpus = Math.round(DEPLOY_BURST_CPU * 1_000_000_000);
    const burstMemoryBytes = DEPLOY_BURST_MEM_MB * 1024 * 1024;
    const deployNanoCpus = Math.max(runtimeNanoCpus, burstNanoCpus);
    const deployMemoryBytes = Math.max(runtimeMemoryBytes, burstMemoryBytes);

    await onLog(
      isSpinDown
        ? `⚡ Target Runtime Plan: Free Tier (Spin Down enabled) — 0.1 vCPU & 512MB RAM limit`
        : `⚡ Target Runtime Plan: Dedicated Tier (Always-On) — ${runtimeCpuQuota} vCPU & ${runtimeMemoryQuotaMB}MB RAM limit`
    );

    await onLog(`Starting container ${containerName} (Blue/Green Zero-Downtime)...`);

    // Attach to internal mesh network
    const networkName = "whizan-internal-network";
    try {
      const net = docker.getNetwork(networkName);
      await net.inspect();
    } catch (netErr: any) {
      if (netErr?.statusCode === 404 || netErr?.message?.includes("not found")) {
        try {
          await docker.createNetwork({
            Name: networkName,
            Driver: "bridge",
            CheckDuplicate: true,
          });
          await onLog(`🌐 Created internal mesh network (${networkName})`);
        } catch {}
      }
    }

    // Clean up any stale container with the same name
    try {
      const existing = docker.getContainer(containerName);
      await existing.remove({ force: true }).catch(() => {});
    } catch {}

    // Ensure permissions
    try {
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile);
      await execFileAsync("chmod", ["-R", "a+rwX", buildDir]).catch(() => {});
    } catch {}

    // Setup port exposure and bindings (only if HTTP service)
    const exposedPorts = isWorker ? {} : { [`${job.internalPort}/tcp`]: {} };
    const portBindings = isWorker ? {} : { [`${job.internalPort}/tcp`]: [{ HostPort: String(hostPort) }] };

    // Set binds (for standard images mount the host directory; for custom Dockerfile images let the container use its own image filesystem)
    const binds = isCustomImage ? [] : [`${path.resolve(buildDir)}:/app`];

    const containerConfig: any = {
      name: containerName,
      Image: image,
      WorkingDir: isCustomImage ? undefined : workingDir,
      Env: env,
      Labels: {
        serviceId: job.serviceId,
        deploymentId: job.deploymentId,
        slug: job.slug,
        type: "service",
        isWorker: isWorker ? "true" : "false",
        autoSleep: isSpinDown ? "true" : "false",
        cpuLimit: String(runtimeCpuQuota),
        memoryLimit: String(runtimeMemoryQuotaMB),
      },
      ExposedPorts: exposedPorts,
      HostConfig: {
        Binds: binds,
        PortBindings: portBindings,
        Memory: deployMemoryBytes,
        NanoCpus: deployNanoCpus,
        PidsLimit: 128,
        CapDrop: [
          "NET_ADMIN",
          "SYS_ADMIN",
          "SYS_RAWIO",
          "SYS_PTRACE",
        ],
        SecurityOpt: ["no-new-privileges:true"],
        RestartPolicy: { Name: "unless-stopped" },
        NetworkMode: networkName,
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [networkName]: {
            Aliases: [job.slug, containerName]
          }
        }
      }
    };

    if (cmd) {
      containerConfig.Cmd = cmd;
    }

    const container = await docker.createContainer(containerConfig);

    // Stream logs
    const logStream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });

    docker.modem.demuxStream(
      logStream,
      {
        write(chunk: Buffer) {
          const lines = chunk.toString().split("\n").filter(Boolean);
          lines.forEach(l => onLog(l).catch(() => {}));
        }
      } as any,
      {
        write(chunk: Buffer) {
          const lines = chunk.toString().split("\n").filter(Boolean);
          lines.forEach(l => onLog(`[stderr] ${l}`).catch(() => {}));
        }
      } as any
    );

    await container.start();

    if (isWorker) {
      await onLog(`Waiting for background worker container to stabilize...`);
    } else {
      await onLog(`Waiting for service to bind to port ${job.internalPort}...`);
    }

    try {
      await this.waitForPort(container, hostPort, job.internalPort, isWorker, 300000, onLog);
      
      if (isWorker) {
        await onLog(`✓ Background worker running continuously and healthy.`);
      } else {
        await onLog(`✓ Service running and healthy. Mapped internal port ${job.internalPort} -> host port ${hostPort}`);
      }

      // Dynamic Runtime Clamping
      if (deployNanoCpus > runtimeNanoCpus || deployMemoryBytes > runtimeMemoryBytes) {
        try {
          await container.update({
            NanoCpus: runtimeNanoCpus,
            Memory: runtimeMemoryBytes,
          });
          await onLog(
            isSpinDown
              ? `🔒 Runtime Resource Enforcement: Successfully clamped container to Free Tier (0.1 vCPU & 512MB RAM).`
              : `🔒 Runtime Resource Enforcement: Successfully clamped container to ${runtimeCpuQuota} vCPU & ${runtimeMemoryQuotaMB}MB RAM.`
          );
        } catch (updateErr: any) {
          console.warn(`[ServiceRunner] Failed to clamp container resources: ${updateErr.message}`);
          await onLog(`⚠️ Warning: Failed to clamp runtime resources: ${updateErr.message}`);
        }
      }

      return { hostPort, containerName };
    } catch (err: any) {
      await new Promise((r) => setTimeout(r, 1000));

      try {
        const rawLogs = await container.logs({
          stdout: true,
          stderr: true,
          tail: 40,
          timestamps: false,
        });
        const recentLines = this.parseDockerLogs(Buffer.isBuffer(rawLogs) ? rawLogs : Buffer.from(rawLogs));
        if (recentLines.length > 0) {
          await onLog(`\n📋 --- Container Output Before Failure ---`);
          for (const line of recentLines.slice(-30)) {
            await onLog(`  ${line}`);
          }
          await onLog(`📋 ---------------------------------------\n`);
        }
      } catch (logErr) {}

      await onLog(`❌ Service startup failed: ${err.message}`);
      if (err.message.includes("Timeout")) {
        await onLog(`💡 Tip: Ensure your app listens on 0.0.0.0 and binds to process.env.PORT (${job.internalPort}).`);
      }
      await onLog(`🧹 Removing failed container ${containerName}...`);
      await container.stop({ t: 2 }).catch(() => {});
      await container.remove({ force: true }).catch(() => {});
      throw err;
    }
  }

  /**
   * Builds a Docker image using the docker CLI with live log streaming
   */
  private async buildDockerImage(
    workDir: string,
    imageTag: string,
    onLog: (line: string) => Promise<void>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn("docker", ["build", "-t", imageTag, "."], {
        cwd: workDir,
        env: { ...process.env, DOCKER_BUILDKIT: "1" },
      });

      proc.stdout.on("data", (data) => {
        const lines = data.toString().split("\n").filter(Boolean);
        lines.forEach((l: string) => onLog(`[build] ${l}`).catch(() => {}));
      });

      proc.stderr.on("data", (data) => {
        const lines = data.toString().split("\n").filter(Boolean);
        lines.forEach((l: string) => onLog(`[build] ${l}`).catch(() => {}));
      });

      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Docker build failed with exit code ${code}`));
      });

      proc.on("error", (err) => reject(err));
    });
  }

  /**
   * Write standard .dockerignore to keep docker context lightweight & fast
   */
  private async writeDockerignore(workDir: string): Promise<void> {
    const dockerignorePath = path.join(workDir, ".dockerignore");
    try {
      await fs.access(dockerignorePath);
    } catch {
      const content = `
.git
.github
node_modules
__pycache__
*.pyc
.venv
venv
env
target
build/libs
.next
dist
.env.local
.whizan
*.log
`;
      await fs.writeFile(dockerignorePath, content.trim()).catch(() => {});
    }
  }

  /**
   * Synthesize zero-config production Python Dockerfile
   * Auto-detects FastAPI, Flask, Django, generic scripts, poetry, pipenv, requirements.txt
   */
  private async writePythonDockerfile(
    workDir: string,
    port: number,
    customStart?: string,
    filesInWorkDir: string[] = []
  ): Promise<void> {
    const candidateFiles = ["main.py", "app.py", "server.py", "wsgi.py", "index.py", "manage.py", "api.py"];
    let detectedModule = "main";
    let detectedAppVar = "app";
    let isFastApi = false;
    let isFlask = false;
    let isDjango = filesInWorkDir.includes("manage.py");

    for (const fileName of candidateFiles) {
      if (filesInWorkDir.includes(fileName)) {
        try {
          const content = await fs.readFile(path.join(workDir, fileName), "utf-8");
          if (content.includes("FastAPI(") || content.includes("from fastapi import")) {
            isFastApi = true;
            detectedModule = fileName.replace(/\.py$/, "");
            const match = content.match(/([a-zA-Z0-9_]+)\s*=\s*FastAPI\(/);
            if (match) detectedAppVar = match[1];
            break;
          }
          if (content.includes("Flask(") || content.includes("from flask import") || content.includes("import flask")) {
            isFlask = true;
            detectedModule = fileName.replace(/\.py$/, "");
            const match = content.match(/([a-zA-Z0-9_]+)\s*=\s*Flask\(/);
            if (match) detectedAppVar = match[1];
            break;
          }
        } catch {}
      }
    }

    if (!isFastApi && !isFlask && !isDjango) {
      const commonPyEntries = ["main.py", "app.py", "server.py", "wsgi.py", "index.py", "api.py", "run.py", "application.py"];
      const foundEntry = commonPyEntries.find(entry => filesInWorkDir.includes(entry));
      if (foundEntry) {
        detectedModule = foundEntry.replace(/\.py$/, "");
      } else {
        const firstPy = filesInWorkDir.find(f => f.endsWith(".py") && !f.startsWith("test") && !f.includes("scraper") && !f.includes("crawler") && !f.includes("worker") && !f.includes("util"));
        if (firstPy) {
          detectedModule = firstPy.replace(/\.py$/, "");
        } else {
          const fallbackPy = filesInWorkDir.find(f => f.endsWith(".py") && !f.startsWith("test"));
          if (fallbackPy) detectedModule = fallbackPy.replace(/\.py$/, "");
        }
      }
    }

    let startCmd = `["python", "${detectedModule}.py"]`;
    if (customStart && customStart.trim() !== "" && customStart !== "npm start" && customStart !== "python main.py") {
      startCmd = `["sh", "-c", "${customStart.replace(/"/g, '\\"')}"]`;
    } else if (isDjango) {
      startCmd = `["sh", "-c", "python manage.py migrate --noinput || true; python manage.py runserver 0.0.0.0:${port}"]`;
    } else if (isFastApi) {
      startCmd = `["uvicorn", "${detectedModule}:${detectedAppVar}", "--host", "0.0.0.0", "--port", "${port}"]`;
    } else if (isFlask) {
      startCmd = `["sh", "-c", "gunicorn -w 2 -b 0.0.0.0:${port} ${detectedModule}:${detectedAppVar} || python -m flask --app ${detectedModule} run --host 0.0.0.0 --port ${port}"]`;
    }

    // Auto-detect missing requirements if no manifest exists
    const hasRequirements = filesInWorkDir.includes("requirements.txt");
    const hasPoetry = filesInWorkDir.includes("pyproject.toml");
    const hasPipenv = filesInWorkDir.includes("Pipfile");

    if (!hasRequirements && !hasPoetry && !hasPipenv) {
      const detectedPkgs: string[] = [];
      try {
        for (const f of filesInWorkDir.filter(f => f.endsWith(".py"))) {
          const txt = await fs.readFile(path.join(workDir, f), "utf8").catch(() => "");
          if (txt.includes("fastapi")) detectedPkgs.push("fastapi");
          if (txt.includes("flask")) detectedPkgs.push("flask");
          if (txt.includes("requests")) detectedPkgs.push("requests");
          if (txt.includes("pydantic")) detectedPkgs.push("pydantic");
          if (txt.includes("sqlalchemy")) detectedPkgs.push("sqlalchemy");
          if (txt.includes("pymongo")) detectedPkgs.push("pymongo");
          if (txt.includes("redis")) detectedPkgs.push("redis");
          if (txt.includes("httpx")) detectedPkgs.push("httpx");
          if (txt.includes("django")) detectedPkgs.push("django");
        }
        if (detectedPkgs.length > 0) {
          const uniquePkgs = Array.from(new Set(detectedPkgs));
          await fs.writeFile(path.join(workDir, "requirements.txt"), uniquePkgs.join("\n"));
        }
      } catch {}
    }

    const dockerfile = `
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies for C-extensions (psycopg2, cryptography, pillow, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc \\
    python3-dev \\
    libpq-dev \\
    libssl-dev \\
    libffi-dev \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

# Install package manager & dependencies
COPY requirements.txt* pyproject.toml* Pipfile* Pipfile.lock* poetry.lock* ./
RUN if [ -f requirements.txt ]; then \\
        pip install --no-cache-dir -r requirements.txt; \\
    elif [ -f pyproject.toml ]; then \\
        pip install --no-cache-dir poetry && poetry config virtualenvs.create false && (poetry install --no-interaction --no-ansi || pip install --no-cache-dir . || true); \\
    elif [ -f Pipfile ]; then \\
        pip install --no-cache-dir pipenv && (pipenv install --system --deploy || pipenv install --system || true); \\
    fi

# Auto-ensure ASGI/WSGI servers are present for FastAPI/Flask
RUN pip install --no-cache-dir "uvicorn[standard]" gunicorn || true

COPY . .

ENV PORT=${port} HOST=0.0.0.0 HOSTNAME=0.0.0.0 PYTHONUNBUFFERED=1
EXPOSE ${port}
CMD ${startCmd}
`;
    await fs.writeFile(path.join(workDir, "Dockerfile"), dockerfile.trim());
  }

  /**
   * Synthesize multi-stage Go Dockerfile
   * Builds ultra-compact static binary (sub-15MB container)
   */
  private async writeGoDockerfile(
    workDir: string,
    port: number,
    customStart?: string,
    filesInWorkDir: string[] = []
  ): Promise<void> {
    const dockerfile = `
FROM golang:1.22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git ca-certificates gcc musl-dev
COPY . .
RUN if [ ! -f go.mod ]; then go mod init app && go mod tidy; else go mod download; fi
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server . || go build -o /app/server .

FROM alpine:3.19
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /app/server /app/server
ENV PORT=${port} HOST=0.0.0.0
EXPOSE ${port}
CMD ["/app/server"]
`;
    await fs.writeFile(path.join(workDir, "Dockerfile"), dockerfile.trim());
  }

  /**
   * Synthesize .NET 8 (C# / ASP.NET Core) Dockerfile
   */
  private async writeDotnetDockerfile(workDir: string, port: number): Promise<void> {
    const dockerfile = `
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS builder
WORKDIR /app
COPY . .
RUN dotnet publish -c Release -o /app/out

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=builder /app/out .
ENV PORT=${port} ASPNETCORE_URLS=http://0.0.0.0:${port} HOST=0.0.0.0
EXPOSE ${port}
CMD ["sh", "-c", "DLL=$(find . -maxdepth 1 -name '*.dll' ! -name 'Microsoft.*' ! -name 'System.*' | head -n 1); dotnet $DLL"]
`;
    await fs.writeFile(path.join(workDir, "Dockerfile"), dockerfile.trim());
  }

  /**
   * Synthesize Node.js Dockerfile
   */
  private async writeNodeDockerfile(
    workDir: string,
    port: number,
    customStart?: string,
    filesInWorkDir: string[] = []
  ): Promise<void> {
    let startCmd = '["npm", "start"]';
    if (customStart && customStart.trim() !== "" && customStart !== "npm start") {
      startCmd = `["sh", "-c", "${customStart.replace(/"/g, '\\"')}"]`;
    } else {
      try {
        const pkgRaw = await fs.readFile(path.join(workDir, "package.json"), "utf8");
        const pkg = JSON.parse(pkgRaw);
        if (pkg.scripts?.start) {
          startCmd = '["npm", "start"]';
        } else if (filesInWorkDir.includes("server.js")) {
          startCmd = '["node", "server.js"]';
        } else if (filesInWorkDir.includes("dist/index.js")) {
          startCmd = '["node", "dist/index.js"]';
        } else if (filesInWorkDir.includes("index.js")) {
          startCmd = '["node", "index.js"]';
        }
      } catch {}
    }

    const dockerfile = `
FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json pnpm-lock.yaml* yarn.lock* bun.lockb* ./
RUN if [ -f pnpm-lock.yaml ]; then npm install -g pnpm && pnpm install; \\
    elif [ -f yarn.lock ]; then yarn install; \\
    elif [ -f bun.lockb ]; then npm install -g bun && bun install; \\
    elif [ -f package.json ]; then npm install; fi
COPY . .
RUN if [ -f package.json ] && grep -q '"build"' package.json; then npm run build || true; fi
ENV PORT=${port} HOST=0.0.0.0 HOSTNAME=0.0.0.0
EXPOSE ${port}
CMD ${startCmd}
`;
    await fs.writeFile(path.join(workDir, "Dockerfile"), dockerfile.trim());
  }

  /**
   * Synthesize universal container Dockerfile for any script or binary
   */
  private async writeUniversalDockerfile(workDir: string, port: number, customStart?: string): Promise<void> {
    const cmd = customStart && customStart.trim() !== "" ? `["sh", "-c", "${customStart.replace(/"/g, '\\"')}"]` : '["sh", "-c", "echo Ready && sleep infinity"]';
    const dockerfile = `
FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl bash && rm -rf /var/lib/apt/lists/*
COPY . .
ENV PORT=${port} HOST=0.0.0.0
EXPOSE ${port}
CMD ${cmd}
`;
    await fs.writeFile(path.join(workDir, "Dockerfile"), dockerfile.trim());
  }

  /**
   * Synthesize multi-stage Rust Dockerfile
   */
  private async writeRustDockerfile(workDir: string, port: number): Promise<void> {
    const dockerfile = `
FROM rust:1.77-slim as builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev gcc && rm -rf /var/lib/apt/lists/*
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/ /app/target/release/
ENV PORT=${port} HOST=0.0.0.0 HOSTNAME=0.0.0.0
EXPOSE ${port}
CMD ["sh", "-c", "BIN=$(find /app/target/release -maxdepth 1 -type f -executable ! -name '*.d' | head -n 1); echo 'Starting Rust binary: '$BIN; exec $BIN"]
`;
    await fs.writeFile(path.join(workDir, "Dockerfile"), dockerfile.trim());
  }

  /**
   * Detects Java version required by the project from pom.xml or build.gradle
   */
  private async detectJavaVersion(workDir: string): Promise<string> {
    // 1. Check pom.xml
    try {
      const pomContent = await fs.readFile(path.join(workDir, "pom.xml"), "utf8");
      
      // Match <java.version>24</java.version>
      const jvMatch = pomContent.match(/<java\.version>\s*([0-9.]+)\s*<\/java\.version>/i);
      if (jvMatch) return this.normalizeJavaVersion(jvMatch[1]);

      // Match <maven.compiler.release>24</maven.compiler.release>
      const releaseMatch = pomContent.match(/<maven\.compiler\.release>\s*([0-9.]+)\s*<\/maven\.compiler\.release>/i);
      if (releaseMatch) return this.normalizeJavaVersion(releaseMatch[1]);

      // Match <maven.compiler.target>24</maven.compiler.target>
      const targetMatch = pomContent.match(/<maven\.compiler\.target>\s*([0-9.]+)\s*<\/maven\.compiler\.target>/i);
      if (targetMatch) return this.normalizeJavaVersion(targetMatch[1]);

      // Match <maven.compiler.source>24</maven.compiler.source>
      const sourceMatch = pomContent.match(/<maven\.compiler\.source>\s*([0-9.]+)\s*<\/maven\.compiler\.source>/i);
      if (sourceMatch) return this.normalizeJavaVersion(sourceMatch[1]);

      // Generic <release>24</release> or <target>24</target>
      const genericRel = pomContent.match(/<release>\s*([0-9.]+)\s*<\/release>/i);
      if (genericRel) return this.normalizeJavaVersion(genericRel[1]);
    } catch {}

    // 2. Check build.gradle and build.gradle.kts
    const gradleFiles = ["build.gradle", "build.gradle.kts"];
    for (const gFile of gradleFiles) {
      try {
        const content = await fs.readFile(path.join(workDir, gFile), "utf8");
        const toolchainMatch = content.match(/JavaLanguageVersion\.of\(\s*([0-9]+)\s*\)/i) ||
          content.match(/jvmToolchain\(\s*([0-9]+)\s*\)/i);
        if (toolchainMatch) return this.normalizeJavaVersion(toolchainMatch[1]);

        const compatMatch = content.match(/sourceCompatibility\s*=\s*['"]?([0-9.]+)['"]?/i) ||
          content.match(/JavaVersion\.VERSION_([0-9_]+)/i);
        if (compatMatch) return this.normalizeJavaVersion(compatMatch[1].replace(/_/g, "."));
      } catch {}
    }

    // Default to LTS Java 17
    return "17";
  }

  private normalizeJavaVersion(raw: string): string {
    const cleaned = (raw || "").trim();
    if (cleaned === "1.8" || cleaned === "8") return "8";
    if (cleaned.startsWith("1.")) return cleaned.slice(2);
    const num = parseInt(cleaned, 10);
    if (!isNaN(num) && num >= 8 && num <= 25) {
      return String(num);
    }
    return cleaned || "17";
  }

  /**
   * Detects configured Spring Boot port from application.properties or application.yml
   */
  private async detectSpringBootPort(workDir: string): Promise<number | null> {
    const candidateFiles = [
      "src/main/resources/application.properties",
      "src/main/resources/application.yml",
      "src/main/resources/application.yaml",
      "application.properties",
      "application.yml",
      "application.yaml",
    ];

    for (const rel of candidateFiles) {
      try {
        const content = await fs.readFile(path.join(workDir, rel), "utf8");
        // server.port = 8080 or server.port: 8080
        const propMatch = content.match(/server\.port\s*[:=]\s*(\d{2,5})/i);
        if (propMatch) {
          return parseInt(propMatch[1], 10);
        }
        // YAML indented: server:\n  port: 8080
        const yamlMatch = content.match(/server:\s*\n(?:\s+.*\n)*?\s+port:\s*(\d{2,5})/i);
        if (yamlMatch) {
          return parseInt(yamlMatch[1], 10);
        }
      } catch {}
    }
    return null;
  }

  /**
   * Synthesize Maven OpenJDK Dockerfile
   */
  private async writeMavenDockerfile(workDir: string, port: number, javaVersion: string = "17"): Promise<void> {
    const builderImage = javaVersion === "24"
      ? "maven:3-eclipse-temurin-24"
      : `maven:3.9-eclipse-temurin-${javaVersion}`;

    const runtimeImage = javaVersion === "24"
      ? "eclipse-temurin:24-jre"
      : javaVersion === "21" || javaVersion === "17" || javaVersion === "11" || javaVersion === "8"
      ? `eclipse-temurin:${javaVersion}-jre-jammy`
      : `eclipse-temurin:${javaVersion}-jre`;

    const dockerfile = `
FROM ${builderImage} as builder
WORKDIR /app
COPY . .
RUN mvn clean package -DskipTests --batch-mode

FROM ${runtimeImage}
WORKDIR /app
COPY --from=builder /app/target/*.jar /app/
ENV PORT=${port} SERVER_PORT=${port} HOST=0.0.0.0 SERVER_ADDRESS=0.0.0.0
EXPOSE ${port}
CMD ["sh", "-c", "JAR=$(find /app -maxdepth 1 -name '*.jar' ! -name '*sources.jar' ! -name '*.original' ! -name '*plain.jar' | head -n 1); if [ -z \\"$JAR\\" ]; then echo 'ERROR: No executable JAR found in /app. Maven build may have failed.'; exit 1; fi; echo \\"☕ Starting Java application with $JAR on port \${PORT:-${port}}...\\"; exec java -XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -Dserver.port=\${PORT:-${port}} -Dserver.address=0.0.0.0 -jar \\"$JAR\\""]
`;
    await fs.writeFile(path.join(workDir, "Dockerfile"), dockerfile.trim());
  }

  /**
   * Synthesize Gradle OpenJDK Dockerfile
   */
  private async writeGradleDockerfile(workDir: string, port: number, javaVersion: string = "17"): Promise<void> {
    const builderImage = javaVersion === "24"
      ? "gradle:jdk24"
      : `gradle:8.5-jdk${javaVersion}`;

    const runtimeImage = javaVersion === "24"
      ? "eclipse-temurin:24-jre"
      : javaVersion === "21" || javaVersion === "17" || javaVersion === "11" || javaVersion === "8"
      ? `eclipse-temurin:${javaVersion}-jre-jammy`
      : `eclipse-temurin:${javaVersion}-jre`;

    const dockerfile = `
FROM ${builderImage} as builder
WORKDIR /app
COPY . .
RUN gradle build --no-daemon -x test

FROM ${runtimeImage}
WORKDIR /app
COPY --from=builder /app/build/libs/*.jar /app/
ENV PORT=${port} SERVER_PORT=${port} HOST=0.0.0.0 SERVER_ADDRESS=0.0.0.0
EXPOSE ${port}
CMD ["sh", "-c", "JAR=$(find /app -maxdepth 1 -name '*.jar' ! -name '*plain.jar' ! -name '*sources.jar' ! -name '*.original' | head -n 1); if [ -z \\"$JAR\\" ]; then echo 'ERROR: No executable JAR found in /app/build/libs. Gradle build may have failed.'; exit 1; fi; echo \\"☕ Starting Java application with $JAR on port \${PORT:-${port}}...\\"; exec java -XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -Dserver.port=\${PORT:-${port}} -Dserver.address=0.0.0.0 -jar \\"$JAR\\""]
`;
    await fs.writeFile(path.join(workDir, "Dockerfile"), dockerfile.trim());
  }

  /**
   * Synthesize PHP Dockerfile
   */
  private async writePhpDockerfile(workDir: string, port: number): Promise<void> {
    const dockerfile = `
FROM php:8.2-cli
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libzip-dev unzip git && rm -rf /var/lib/apt/lists/*
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer
COPY . .
RUN if [ -f composer.json ]; then composer install --no-dev --optimize-autoloader || true; fi
ENV PORT=${port} HOST=0.0.0.0
EXPOSE ${port}
CMD ["sh", "-c", "if [ -f artisan ]; then php artisan serve --host=0.0.0.0 --port=\${PORT:-8000}; elif [ -d public ] && [ -f public/index.php ]; then php -S 0.0.0.0:\${PORT:-8000} -t public; else php -S 0.0.0.0:\${PORT:-8000}; fi"]
`;
    await fs.writeFile(path.join(workDir, "Dockerfile"), dockerfile.trim());
  }

  /**
   * Synthesize Ruby Dockerfile
   */
  private async writeRubyDockerfile(workDir: string, port: number): Promise<void> {
    const dockerfile = `
FROM ruby:3.2-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential git && rm -rf /var/lib/apt/lists/*
COPY . .
RUN bundle install || true
ENV PORT=${port} HOST=0.0.0.0
EXPOSE ${port}
CMD ["sh", "-c", "if [ -f config.ru ]; then bundle exec rackup --host 0.0.0.0 -p \${PORT:-8000}; elif [ -f app.rb ]; then ruby app.rb -o 0.0.0.0 -p \${PORT:-8000}; elif [ -f bin/rails ]; then bundle exec rails server -b 0.0.0.0 -p \${PORT:-8000}; else bundle exec puma -b tcp://0.0.0.0:\${PORT:-8000}; fi"]
`;
    await fs.writeFile(path.join(workDir, "Dockerfile"), dockerfile.trim());
  }

  private async ensureImage(image: string, onLog: (l: string) => Promise<void>): Promise<void> {
    await onLog(`Ensuring base image ${image} is available...`);
    const stream = await docker.pull(image);
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
    });
  }

  private parseDockerLogs(buf: Buffer): string[] {
    const lines: string[] = [];
    if (!Buffer.isBuffer(buf) || buf.length === 0) return lines;

    const isMultiplexed =
      buf.length >= 8 &&
      (buf[0] === 1 || buf[0] === 2) &&
      buf[1] === 0 &&
      buf[2] === 0 &&
      buf[3] === 0;

    if (isMultiplexed) {
      let offset = 0;
      while (offset + 8 <= buf.length) {
        const type = buf.readUInt8(offset);
        const size = buf.readUInt32BE(offset + 4);
        offset += 8;
        if (offset + size > buf.length) {
          const chunk = buf.subarray(offset).toString("utf8");
          chunk.split("\n").filter(Boolean).forEach((l) => lines.push((type === 2 ? "[stderr] " : "") + l.trim()));
          break;
        }
        const chunk = buf.subarray(offset, offset + size).toString("utf8");
        offset += size;
        chunk.split("\n").filter(Boolean).forEach((l) => lines.push((type === 2 ? "[stderr] " : "") + l.trim()));
      }
    } else {
      const text = buf.toString("utf8").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
      text.split("\n").filter(Boolean).forEach((l) => lines.push(l.trim()));
    }
    return lines;
  }

  private async waitForPort(
    container: any,
    port: number,
    internalPort: number,
    isWorker: boolean,
    timeoutMs: number = 300000,
    onLog?: (line: string) => Promise<void>
  ): Promise<void> {
    const start = Date.now();

    // If it's a background queue worker, perform container process liveness check
    if (isWorker) {
      return new Promise((resolve, reject) => {
        let checks = 0;
        const interval = setInterval(async () => {
          checks++;
          try {
            const info = await container.inspect();
            if (!info.State.Running || info.State.Restarting) {
              clearInterval(interval);
              const exitCode = info.State.ExitCode;
              reject(new Error(`Worker container exited prematurely with exit code ${exitCode}`));
              return;
            }
            // Verified running continuously for 6 seconds
            if (checks >= 3) {
              clearInterval(interval);
              resolve();
              return;
            }
          } catch (err) {
            clearInterval(interval);
            reject(err);
          }
        }, 2000);
      });
    }

    return new Promise((resolve, reject) => {
      let isSettled = false;
      let loopbackWarningSent = false;

      const interval = setInterval(async () => {
        if (isSettled) return;

        // 1. Fail fast if container exited unexpectedly or is in a crash/restart loop
        try {
          const info = await container.inspect();
          if (!info.State.Running || info.State.Restarting) {
            isSettled = true;
            clearInterval(interval);
            const exitCode = info.State.ExitCode;
            const oomKilled = info.State.OOMKilled;
            let reason = `exit code ${exitCode}`;
            if (oomKilled) reason += " (Out of Memory - 512MB RAM limit exceeded)";
            if (info.State.Error) reason += ` - ${info.State.Error}`;
            reject(
              new Error(
                `Service container exited or crashed unexpectedly (${reason})`
              )
            );
            return;
          }
        } catch {}

        // 2. Probe HTTP endpoint with a strict per-request timeout
        try {
          await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1500) });
          isSettled = true;
          clearInterval(interval);
          resolve();
          return;
        } catch {
          try {
            await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(1500) });
            isSettled = true;
            clearInterval(interval);
            resolve();
            return;
          } catch {}
        }

        // 3. Proactive binding diagnostic check if still failing after 15 seconds
        if (!loopbackWarningSent && Date.now() - start > 15000 && onLog) {
          loopbackWarningSent = true;
          try {
            const rawLogs = await container.logs({ stdout: true, stderr: true, tail: 30, timestamps: false });
            const logStr = (Buffer.isBuffer(rawLogs) ? rawLogs.toString("utf8") : String(rawLogs)).toLowerCase();
            if (logStr.includes("127.0.0.1") || logStr.includes("localhost")) {
              await onLog("⚠️ Binding diagnostic: Server appears to bind to 127.0.0.1 / localhost. Ensure your code binds to host 0.0.0.0 so the edge router can reach it.");
            }
          } catch {}
        }

        // 4. Check overall timeout
        if (Date.now() - start > timeoutMs) {
          isSettled = true;
          clearInterval(interval);
          reject(
            new Error(
              `Timeout waiting for HTTP service on port ${port} (internal port ${internalPort}) to become healthy after ${Math.round(
                timeoutMs / 1000
              )}s.`
            )
          );
        }
      }, 2000);
    });
  }

  private async findFreePort(preferredPort?: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on("error", (err: any) => {
        if (preferredPort && err.code === 'EADDRINUSE') {
          const randomServer = net.createServer();
          randomServer.listen(0, () => {
            const port = (randomServer.address() as net.AddressInfo).port;
            randomServer.close(() => resolve(port));
          });
        } else {
          reject(err);
        }
      });
      server.listen(preferredPort || 0, () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close(() => resolve(port));
      });
    });
  }
}
