// ─── Whizan CLI — Cron Jobs Command ───────────────────────────────────────────

import { client } from "../core/client.js";
import { colors, Spinner, printError, printKV } from "../utils/terminal-ui.js";

const c = colors;

export async function cronCommand(args: string[] = []) {
  const sub = args[0]?.toLowerCase();
  const subArgs = args.slice(1);

  switch (sub) {
    case "ls":
    case "list": {
      const spinner = new Spinner("Fetching scheduled cron jobs...").start();
      const crons = await client.listCronJobs();
      spinner.stop();

      if (!crons || crons.length === 0) {
        console.error(`  ${c.dim}No scheduled cron jobs found. Run 'whizan cron create' to schedule one.${c.reset}\n`);
        return;
      }

      console.error(`\n  ${c.bold}Whizan Enterprise Cron Jobs (${crons.length}):${c.reset}\n`);
      for (const cron of crons) {
        const statusColor = cron.enabled ? c.emerald : c.amber;
        console.error(`  ${statusColor}●${c.reset} ${c.bold}${cron.name}${c.reset} ${c.dim}(Schedule: ${cron.schedule}, ${cron.enabled ? "Active" : "Paused"})${c.reset}`);
        console.error(`    ${c.dim}ID:${c.reset} ${cron.id}  ${c.dim}Target:${c.reset} ${cron.target?.type || "UNKNOWN"}  ${c.dim}Next Run:${c.reset} ${cron.nextRunAt ? new Date(cron.nextRunAt).toLocaleString() : "Pending"}`);
      }
      console.error("");
      break;
    }

    case "create": {
      const name = subArgs.find((a) => !a.startsWith("-"));
      if (!name) {
        printError("Usage: whizan cron create <name> --schedule \"*/5 * * * *\" --pipeline <FUNCTION|CONTAINER_EXEC|SERVICE|WEBHOOK> --target <target-id-or-url> [--cmd <command>]");
        process.exit(1);
      }

      let schedule = "0 * * * *";
      const schedIdx = subArgs.findIndex((a) => a === "--schedule" || a === "-s");
      if (schedIdx !== -1 && subArgs[schedIdx + 1]) schedule = subArgs[schedIdx + 1];

      let pipeline = "FUNCTION";
      const pipeIdx = subArgs.findIndex((a) => a === "--pipeline" || a === "--target-type");
      if (pipeIdx !== -1 && subArgs[pipeIdx + 1]) pipeline = subArgs[pipeIdx + 1].toUpperCase();

      let targetVal = "";
      const targetIdx = subArgs.findIndex((a) => a === "--target" || a === "-t");
      if (targetIdx !== -1 && subArgs[targetIdx + 1]) targetVal = subArgs[targetIdx + 1];

      let cmd = "";
      const cmdIdx = subArgs.findIndex((a) => a === "--cmd" || a === "-c");
      if (cmdIdx !== -1 && subArgs[cmdIdx + 1]) cmd = subArgs[cmdIdx + 1];

      const target: any = { type: pipeline };
      if (pipeline === "FUNCTION") {
        target.functionId = targetVal;
        target.endpoint = cmd || "/";
      } else if (pipeline === "CONTAINER_EXEC") {
        target.serviceId = targetVal;
        target.command = cmd || "python manage.py run_task";
      } else if (pipeline === "SERVICE") {
        target.serviceId = targetVal;
        target.path = cmd || "/";
      } else if (pipeline === "WEBHOOK") {
        target.url = targetVal;
      }

      const spinner = new Spinner(`Creating cron job "${name}" (${schedule})...`).start();
      try {
        const cron = await client.createCronJob({
          name,
          schedule,
          target,
          misfirePolicy: "SKIP",
          concurrencyPolicy: "FORBID",
          enabled: true,
        });

        spinner.succeed(`Cron job "${name}" created successfully!`);
        console.error(`\n  ${c.bold}Cron Details:${c.reset}`);
        printKV("Job ID", cron.id);
        printKV("Schedule", schedule);
        printKV("Pipeline", pipeline);
        printKV("Misfire Policy", "SKIP (reboot safe)");
      } catch (err: any) {
        spinner.fail("Cron creation failed");
        printError(err.message || String(err));
        process.exit(1);
      }
      break;
    }

    case "trigger": {
      const id = subArgs.find((a) => !a.startsWith("-"));
      if (!id) {
        printError("Usage: whizan cron trigger <cron-job-id>");
        process.exit(1);
      }

      const spinner = new Spinner(`Triggering cron job ${id}...`).start();
      try {
        const res = await client.triggerCronJob(id);
        spinner.succeed(`Cron job ${c.whizanCyan}${id}${c.reset} triggered successfully!`);
        if (res.runId) {
          printKV("Execution Run ID", res.runId);
        }
      } catch (err: any) {
        spinner.fail("Trigger failed");
        printError(err.message || String(err));
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`
  ${c.bold}${c.brightWhite}WHIZAN CRON JOBS USAGE${c.reset}
    ${c.whizanCyan}whizan cron ls${c.reset}                                    List scheduled cron jobs
    ${c.whizanCyan}whizan cron create <name> --schedule "..."${c.reset}        Create scheduled cron job
    ${c.whizanCyan}whizan cron trigger <id>${c.reset}                         Manually trigger immediate execution
`);
      break;
  }
}
