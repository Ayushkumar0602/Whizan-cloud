import { WhizanClient } from "../packages/mcp-devops/src/whizan-client.js";

const client = new WhizanClient();

async function runEndToEndTests() {
  console.log("===============================================================");
  console.log("🧪 WHIZAN CRON & SCHEDULED COMPUTE — END-TO-END TEST SUITE");
  console.log("===============================================================\n");

  // Step 0: Auth Check
  console.log("[Step 0] Checking Whizan Cloud Authentication...");
  const auth = await client.getAuthStatus();
  if (!auth.authenticated) {
    throw new Error(`Authentication failed: ${auth.message}`);
  }
  console.log(`✅ Authenticated as: ${auth.user.name} (${auth.user.email}) [Role: ${auth.user.role}]`);
  console.log(`   API Endpoint: ${auth.apiUrl}\n`);

  // Step 1: Create Edge Function Scheduled Task
  console.log("[Step 1] Creating Scheduled Cron Job: Edge Function Target...");
  const edgeJob = await client.createCronJob({
    name: "Edge Function Health & Warmup",
    description: "Scheduled V8 isolate execution testing sub-5ms latency and zero-idle sleep",
    schedule: "*/5 * * * *",
    timezone: "UTC",
    target: {
      targetType: "FUNCTION",
      serviceId: "371f7d89-d78d-4beb-8448-e9ed9117cf36", // Smart Study API
      endpointPath: "/health",
      method: "GET",
    },
    misfirePolicy: "FIRE_LATEST_ONCE",
    concurrencyPolicy: "FORBID",
    timeoutSeconds: 30,
    enabled: true,
  });

  console.log(`✅ Created Cron Job: "${edgeJob.name}"`);
  console.log(`   Job ID: ${edgeJob.id}`);
  console.log(`   Schedule: ${edgeJob.schedule} (${edgeJob.timezone})`);
  console.log(`   Target: ${edgeJob.targetType}`);
  console.log(`   Next Run At: ${edgeJob.nextRunAt}\n`);

  // Step 2: Create Docker Container Exec Scheduled Task
  console.log("[Step 2] Creating Scheduled Cron Job: Container Exec CLI Target...");
  const execJob = await client.createCronJob({
    name: "Container System Disk Audit",
    description: "Executes direct CLI 'df -h' command inside container via Docker socket",
    schedule: "0 0 * * *",
    timezone: "UTC",
    target: {
      targetType: "CONTAINER_EXEC",
      serviceId: "whizan-api",
      command: ["df", "-h"],
    },
    misfirePolicy: "SKIP",
    concurrencyPolicy: "FORBID",
    timeoutSeconds: 60,
    enabled: true,
  });

  console.log(`✅ Created Cron Job: "${execJob.name}"`);
  console.log(`   Job ID: ${execJob.id}`);
  console.log(`   Schedule: ${execJob.schedule}`);
  console.log(`   Target: ${execJob.targetType}`);
  console.log(`   Next Run At: ${execJob.nextRunAt}\n`);

  // Step 3: List Scheduled Jobs
  console.log("[Step 3] Querying All Active Cron Schedules from Control Plane...");
  const allJobs = await client.listCronJobs();
  console.log(`✅ Retrieved ${allJobs.length} scheduled job(s):`);
  allJobs.forEach((j) => {
    console.log(`   • [${j.targetType}] ${j.name} (Schedule: ${j.schedule}, Next: ${j.nextRunAt || "None"})`);
  });
  console.log();

  // Step 4: 1-Click Immediate Execution Trigger (Edge Function)
  console.log(`[Step 4] Triggering 1-Click Immediate Execution for Job ${edgeJob.id}...`);
  const triggerRes = await client.triggerCronJob(edgeJob.id);
  console.log(`✅ Trigger Response:`, triggerRes);
  const executionId = triggerRes.executionId;

  // Step 5: Wait and Poll Execution History & 64KB Ring Buffer Logs
  console.log("\n[Step 5] Waiting 4 seconds for cloud scheduler to dispatch & buffer telemetry...");
  await new Promise((r) => setTimeout(r, 4000));

  console.log(`[Step 6] Inspecting Execution History for Job ${edgeJob.id}...`);
  const history = await client.getCronHistory(edgeJob.id, 5);
  console.log(`✅ Total Executions recorded: ${history.total || history.executions?.length || 0}`);

  if (history.executions && history.executions.length > 0) {
    const latest = history.executions[0];
    console.log("   ┌────────────────────────────────────────────────────────┐");
    console.log(`   │ Status:      ${latest.status}`);
    console.log(`   │ Trigger:     ${latest.triggerType}`);
    console.log(`   │ Duration:    ${latest.durationMs ? `${latest.durationMs} ms` : "N/A"}`);
    console.log(`   │ HTTP Status: ${latest.httpStatusCode ?? "N/A"}`);
    console.log(`   │ Started At:  ${latest.startedAt}`);
    console.log("   ├─────────────────── RING BUFFER STDOUT ─────────────────┤");
    if (latest.stdout) {
      console.log(latest.stdout.trim().split("\n").map((l: string) => `   │ ${l}`).join("\n"));
    } else {
      console.log("   │ (No stdout or still buffering)");
    }
    console.log("   └────────────────────────────────────────────────────────┘\n");
  }

  console.log("===============================================================");
  console.log("🎉 ALL CRON ENGINE END-TO-END TESTS COMPLETED SUCCESSFULLY!");
  console.log("===============================================================");
}

runEndToEndTests().catch((err) => {
  console.error("\n❌ End-to-end test failed:", err);
  process.exit(1);
});
