// ─── Whizan CLI — Database Management Command ─────────────────────────────────

import { client } from "../core/client.js";
import { colors, Spinner, printError, printKV } from "../utils/terminal-ui.js";

const c = colors;

export async function dbCommand(args: string[] = []) {
  const sub = args[0]?.toLowerCase();
  const subArgs = args.slice(1);

  switch (sub) {
    case "ls":
    case "list": {
      const spinner = new Spinner("Fetching provisioned databases...").start();
      const dbs = await client.listDatabases();
      spinner.stop();

      if (!dbs || dbs.length === 0) {
        console.error(`  ${c.dim}No databases provisioned yet. Run 'whizan db create <name>' to create one.${c.reset}\n`);
        return;
      }

      console.error(`\n  ${c.bold}Whizan Managed Databases (${dbs.length}):${c.reset}\n`);
      for (const db of dbs) {
        const statusColor = db.status === "READY" || db.status === "ACTIVE" ? c.emerald : c.amber;
        console.error(`  ${statusColor}●${c.reset} ${c.bold}${db.name}${c.reset} ${c.dim}(${db.type || "POSTGRESQL"}, ${db.instanceType || "starter"})${c.reset}`);
        console.error(`    ${c.dim}ID:${c.reset} ${db.id}  ${c.dim}Status:${c.reset} ${statusColor}${db.status}${c.reset}  ${c.dim}Port:${c.reset} ${db.port || "5432"}`);
        if (db.connectionString) {
          console.error(`    ${c.dim}URI:${c.reset} ${c.whizanCyan}${db.connectionString}${c.reset}`);
        }
      }
      console.error("");
      break;
    }

    case "create": {
      const name = subArgs.find((a) => !a.startsWith("-"));
      if (!name) {
        printError("Usage: whizan db create <name> [--type POSTGRESQL|REDIS|MYSQL] [--instance starter|standard|pro] [--bind <service-id>]");
        process.exit(1);
      }

      let type: "POSTGRESQL" | "REDIS" | "MYSQL" = "POSTGRESQL";
      const typeIdx = subArgs.findIndex((a) => a === "--type");
      if (typeIdx !== -1 && subArgs[typeIdx + 1]) {
        const t = subArgs[typeIdx + 1].toUpperCase();
        if (t === "REDIS" || t === "MYSQL" || t === "POSTGRESQL") {
          type = t as any;
        }
      }

      let instanceType: "starter" | "standard" | "pro" = "starter";
      const instIdx = subArgs.findIndex((a) => a === "--instance");
      if (instIdx !== -1 && subArgs[instIdx + 1]) {
        const inst = subArgs[instIdx + 1].toLowerCase();
        if (inst === "starter" || inst === "standard" || inst === "pro") {
          instanceType = inst as any;
        }
      }

      if (instanceType !== "starter") {
        try {
          const authStatus = await client.getAuthStatus();
          const canCustomize =
            authStatus?.user?.role === "ADMIN" ||
            authStatus?.user?.role === "ROOT_ADMIN" ||
            authStatus?.user?.email === "aj0892829122@gmail.com" ||
            authStatus?.user?.subscriptionTier === "PROFESSIONAL";
          if (!canCustomize) {
            console.error(
              `  ${c.amber}ℹ Portfolio Forced-Idleness: Custom database tiers require Professional plan or administrator permission. Defaulting to 'starter' tier with 20m auto-sleep.${c.reset}`
            );
            instanceType = "starter";
          }
        } catch {
          instanceType = "starter";
        }
      }

      let bindTargetId: string | null = null;
      const bindIdx = subArgs.findIndex((a) => a === "--bind");
      if (bindIdx !== -1 && subArgs[bindIdx + 1]) {
        bindTargetId = subArgs[bindIdx + 1];
      }

      const spinner = new Spinner(`Provisioning ${type} database "${name}" (${instanceType} tier)...`).start();
      try {
        const db = await client.provisionDatabase({
          name,
          type,
          instanceType,
          enablePooler: true,
        });

        spinner.succeed(`Database "${name}" provisioned successfully!`);
        console.error(`\n  ${c.bold}Database Details:${c.reset}`);
        printKV("Database ID", db.id || "created");
        printKV("Type", type);
        printKV("Instance Tier", instanceType);

        const connStr = db.connectionString || db.uri || db.externalUrl;
        if (connStr) {
          console.error(`\n  ${c.amber}⚠ SAVE THIS CONNECTION STRING SECURELY:${c.reset}`);
          console.error(`  ${c.whizanCyan}${c.bold}${connStr}${c.reset}\n`);
        }

        // Auto-bind to specified service
        if (bindTargetId && connStr) {
          const bindSpinner = new Spinner(`Binding connection string to service ${bindTargetId}...`).start();
          const envKey = type === "REDIS" ? "REDIS_URL" : "DATABASE_URL";
          await client.setEnvVars("service", bindTargetId, { [envKey]: connStr });
          bindSpinner.succeed(`Injected ${c.bold}${envKey}${c.reset} into service ${bindTargetId}!`);
        }
      } catch (err: any) {
        spinner.fail("Database provisioning failed");
        printError(err.message || String(err));
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`
  ${c.bold}${c.brightWhite}WHIZAN DATABASE USAGE${c.reset}
    ${c.whizanCyan}whizan db ls${c.reset}                               List all databases
    ${c.whizanCyan}whizan db create <name>${c.reset}                   Provision a PostgreSQL database
    ${c.whizanCyan}whizan db create <name> --type REDIS${c.reset}      Provision a Redis database
    ${c.whizanCyan}whizan db create <name> --bind <id>${c.reset}        Provision and auto-bind DATABASE_URL to a service
`);
      break;
  }
}
