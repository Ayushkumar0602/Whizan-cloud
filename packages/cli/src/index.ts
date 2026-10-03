// ─── Whizan Cloud CLI — Main Entry & Command Router ──────────────────────────

import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { whoamiCommand } from "./commands/whoami.js";
import { deployCommand, redeployCommand } from "./commands/deploy.js";
import { initCommand } from "./commands/init.js";
import { psCommand } from "./commands/ps.js";
import { logsCommand } from "./commands/logs.js";
import { envCommand } from "./commands/env.js";
import { dbCommand } from "./commands/db.js";
import { fnCommand } from "./commands/fn.js";
import { cronCommand } from "./commands/cron.js";
import { execCommand } from "./commands/exec.js";
import { linkCommand, unlinkCommand } from "./commands/link.js";
import { deleteCommand } from "./commands/delete.js";
import { openCommand } from "./commands/open.js";
import { topCommand } from "./commands/top.js";
import { printBanner, colors, printError } from "./utils/terminal-ui.js";

const c = colors;
const VERSION = "1.0.0";

function printHelp() {
  printBanner(VERSION);
  console.error(`
  ${c.bold}${c.brightWhite}USAGE${c.reset}
    ${c.whizanCyan}whizan${c.reset} ${c.dim}<command>${c.reset} ${c.dim}[options]${c.reset}

  ${c.bold}${c.brightWhite}AUTH${c.reset}
    ${c.whizanCyan}login${c.reset}              Log in via browser or API key (${c.dim}whizan login -t KEY${c.reset})
    ${c.whizanCyan}logout${c.reset}             Remove saved credentials
    ${c.whizanCyan}whoami${c.reset}             Show current user, plan, and resource counts

  ${c.bold}${c.brightWhite}DEPLOY${c.reset}
    ${c.whizanCyan}deploy${c.reset}             Deploy current project to Whizan Cloud
    ${c.whizanCyan}redeploy${c.reset}           Re-deploy an existing linked project
    ${c.whizanCyan}init${c.reset}               Generate .whizan.json config for this project

  ${c.bold}${c.brightWhite}RESOURCES${c.reset}
    ${c.whizanCyan}top${c.reset}                Real-time terminal resource monitor dashboard
    ${c.whizanCyan}ps${c.reset}                 List all services, projects, functions, and crons
    ${c.whizanCyan}logs${c.reset}               Stream logs (${c.dim}--tail${c.reset}) or AI diagnose (${c.dim}--ai "query"${c.reset})
    ${c.whizanCyan}open${c.reset}               Open live URL in browser

  ${c.bold}${c.brightWhite}ENVIRONMENT${c.reset}
    ${c.whizanCyan}env set KEY=VAL${c.reset}    Set environment variable on a service or project
    ${c.whizanCyan}env ls${c.reset}             List environment variables
    ${c.whizanCyan}env rm KEY${c.reset}          Remove environment variable

  ${c.bold}${c.brightWhite}DATABASE${c.reset}
    ${c.whizanCyan}db create NAME${c.reset}     Provision a managed PostgreSQL, Redis, or MySQL database
    ${c.whizanCyan}db ls${c.reset}              List provisioned databases

  ${c.bold}${c.brightWhite}EDGE FUNCTIONS${c.reset}
    ${c.whizanCyan}fn deploy${c.reset}          Deploy a serverless V8 edge function
    ${c.whizanCyan}fn invoke PATH${c.reset}     Invoke an edge function endpoint
    ${c.whizanCyan}fn ls${c.reset}              List all edge functions

  ${c.bold}${c.brightWhite}CRON JOBS${c.reset}
    ${c.whizanCyan}cron create${c.reset}        Create a scheduled cron job
    ${c.whizanCyan}cron ls${c.reset}            List cron jobs
    ${c.whizanCyan}cron trigger ID${c.reset}    Manually trigger a cron job

  ${c.bold}${c.brightWhite}OPERATIONS${c.reset}
    ${c.whizanCyan}exec -- CMD${c.reset}        Run a command inside a live container
    ${c.whizanCyan}link${c.reset}               Link this directory to an existing Whizan deployment
    ${c.whizanCyan}unlink${c.reset}             Remove .whizan.json linkage
    ${c.whizanCyan}delete${c.reset}             Delete a service or project

  ${c.bold}${c.brightWhite}OPTIONS${c.reset}
    ${c.dim}--help, -h${c.reset}         Show this help
    ${c.dim}--version, -v${c.reset}      Show version
    ${c.dim}--yes, -y${c.reset}          Skip confirmation prompts
    ${c.dim}--name NAME${c.reset}        Override project name/slug
    ${c.dim}--dir PATH${c.reset}         Deploy a specific subdirectory (monorepo)
    ${c.dim}--port PORT${c.reset}        Override detected internal port
    ${c.dim}--type TYPE${c.reset}        Force deployment type (service|project)
    ${c.dim}--json${c.reset}             Output as JSON (for CI/CD pipelines)
`);
}

function checkNodeVersion() {
  const major = parseInt(process.version.slice(1).split(".")[0], 10);
  if (major < 20) {
    printError(`Whizan CLI requires Node.js 20 or later. Current: ${process.version}`);
    process.exit(1);
  }
}

async function main() {
  checkNodeVersion();

  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();
  const subArgs = args.slice(1);

  switch (command) {
    // Auth
    case "login":
    case "auth":
      await loginCommand(subArgs);
      break;

    case "logout":
      await logoutCommand();
      break;

    case "whoami":
    case "status":
      await whoamiCommand();
      break;

    // Deploy
    case "deploy":
    case "up":
      await deployCommand(subArgs);
      break;

    case "redeploy":
      await redeployCommand(subArgs);
      break;

    case "init":
    case "setup":
      await initCommand(subArgs);
      break;

    // Resources
    case "top":
    case "monitor":
      await topCommand();
      break;

    case "ps":
    case "list":
      await psCommand();
      break;

    case "logs":
      await logsCommand(subArgs);
      break;

    case "open":
      await openCommand(subArgs);
      break;

    // Env
    case "env":
      await envCommand(subArgs);
      break;

    // Database
    case "db":
    case "database":
      await dbCommand(subArgs);
      break;

    // Functions
    case "fn":
    case "function":
      await fnCommand(subArgs);
      break;

    // Cron
    case "cron":
      await cronCommand(subArgs);
      break;

    // Operations
    case "exec":
      await execCommand(subArgs);
      break;

    case "link":
      await linkCommand(subArgs);
      break;

    case "unlink":
      await unlinkCommand();
      break;

    case "delete":
    case "rm":
      await deleteCommand(subArgs);
      break;

    // Meta
    case "--help":
    case "-h":
    case "help":
      printHelp();
      break;

    case "--version":
    case "-v":
    case "version":
      console.log(VERSION);
      break;

    default:
      if (command) {
        printError(`Unknown command: "${command}". Run 'whizan --help' for a list of commands.`);
      } else {
        printHelp();
      }
      break;
  }
}

main().catch((err) => {
  printError(err.message || String(err));
  process.exit(1);
});
