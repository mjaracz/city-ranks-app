import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logsDirectory = path.join(repositoryRoot, '.codex', 'logs');
const runtimeDirectory = path.join(repositoryRoot, '.codex', 'run');
const setupLogPath = path.join(logsDirectory, 'local-environment.log');
const isWindows = process.platform === 'win32';
const pnpmCommand = 'pnpm';
const composeProjectName = process.env.CITY_RANKS_COMPOSE_PROJECT_NAME ?? 'city-ranks-local';
const composeArguments = ['compose', '-p', composeProjectName, '-f', 'compose.yaml'];
const services = [
  { name: 'weather-worker', script: 'start:dev:weather-worker' },
  { name: 'activity-ranking-worker', script: 'start:dev:activity-ranking-worker' },
  { name: 'api-gateway', script: 'start:dev:api-gateway' },
];

function ensureDirectories() {
  mkdirSync(logsDirectory, { recursive: true });
  mkdirSync(runtimeDirectory, { recursive: true });
}

function logStep(label, result) {
  const output = [result.stdout, result.stderr, result.error?.message]
    .filter((value) => Boolean(value))
    .join('');
  const entry = `\n[${new Date().toISOString()}] ${label} (exit ${result.status ?? 'failed'})\n${output}`;
  writeFileSync(setupLogPath, entry, { encoding: 'utf8', flag: 'a' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function getCommandInvocation(command, args) {
  if (!isWindows) return { command, args };
  return {
    command: process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', [command, ...args].join(' ')],
  };
}

function runForeground(command, args, label) {
  const invocation = getCommandInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
  logStep(label, result);
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed. See ${path.relative(repositoryRoot, setupLogPath)} for details.`);
  }
}

function ensurePrerequisites() {
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(composeProjectName)) {
    throw new Error('CITY_RANKS_COMPOSE_PROJECT_NAME must start with a lowercase letter or number and contain only lowercase letters, numbers, hyphens or underscores.');
  }

  const [major, minor] = process.versions.node.split('.').map(Number);
  const supportedNode = (major === 20 && minor >= 19) || (major >= 22 && (major > 22 || minor >= 12));
  if (!supportedNode) {
    throw new Error(`Node.js ${process.versions.node} is unsupported. Install Node.js 20.19+ or 22.12+.`);
  }

  runForeground(pnpmCommand, ['--version'], 'Check pnpm');
  runForeground('docker', ['compose', 'version'], 'Check Docker Compose');
}

function ensureEnvironmentFile() {
  const examplePath = path.join(repositoryRoot, '.env.example');
  const environmentPath = path.join(repositoryRoot, '.env');
  if (!existsSync(environmentPath)) {
    copyFileSync(examplePath, environmentPath);
    console.log('Created .env from .env.example. Review its local development settings if needed.');
    return;
  }
  console.log('Using the existing .env file.');
}

function getApiGatewayPort() {
  if (process.env.API_GATEWAY_PORT !== undefined) return process.env.API_GATEWAY_PORT;
  const environmentFile = readFileSync(path.join(repositoryRoot, '.env'), 'utf8');
  return environmentFile.match(/^API_GATEWAY_PORT=(\d+)$/m)?.[1] ?? '3000';
}

function servicePidPath(name) {
  return path.join(runtimeDirectory, `${name}.json`);
}

function readServicePid(name) {
  const pidPath = servicePidPath(name);
  if (!existsSync(pidPath)) return undefined;

  try {
    const { pid } = JSON.parse(readFileSync(pidPath, 'utf8'));
    if (!Number.isInteger(pid) || pid < 1) throw new Error('Invalid process ID');
    process.kill(pid, 0);
    return pid;
  } catch (error) {
    if (error?.code === 'EPERM') {
      const { pid } = JSON.parse(readFileSync(pidPath, 'utf8'));
      if (Number.isInteger(pid) && pid > 0) return pid;
    }
    rmSync(pidPath, { force: true });
    return undefined;
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function startService(service) {
  const existingPid = readServicePid(service.name);
  if (existingPid) {
    console.log(`${service.name} is already running (PID ${existingPid}).`);
    return;
  }

  const logPath = path.join(logsDirectory, `${service.name}.log`);
  const logDescriptor = openSync(logPath, 'a');
  writeFileSync(logDescriptor, `\n[${new Date().toISOString()}] Starting pnpm run ${service.script}\n`);

  let spawnError;
  let exitResult;
  const invocation = getCommandInvocation(pnpmCommand, ['run', service.script]);
  const child = spawn(invocation.command, invocation.args, {
    cwd: repositoryRoot,
    detached: true,
    env: process.env,
    stdio: ['ignore', logDescriptor, logDescriptor],
    windowsHide: true,
  });
  closeSync(logDescriptor);

  child.once('error', (error) => {
    spawnError = error;
  });
  child.once('exit', (code, signal) => {
    exitResult = { code, signal };
    const pidPath = servicePidPath(service.name);
    if (existsSync(pidPath)) {
      const pidState = JSON.parse(readFileSync(pidPath, 'utf8'));
      if (pidState.pid === child.pid) rmSync(pidPath, { force: true });
    }
  });

  if (!child.pid) {
    throw new Error(`Could not start ${service.name}.`);
  }

  writeFileSync(
    servicePidPath(service.name),
    JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString(), script: service.script }, null, 2),
  );
  child.unref();
  await sleep(1000);

  if (spawnError || exitResult) {
    rmSync(servicePidPath(service.name), { force: true });
    throw new Error(
      `${service.name} exited during startup${spawnError ? `: ${spawnError.message}` : ` (code ${exitResult?.code}, signal ${exitResult?.signal})`}. See ${path.relative(repositoryRoot, logPath)}.`,
    );
  }

  console.log(`${service.name} started as PID ${child.pid}; log: ${path.relative(repositoryRoot, logPath)}`);
}

async function startEnvironment() {
  ensureDirectories();
  ensurePrerequisites();
  ensureEnvironmentFile();
  runForeground(pnpmCommand, ['install', '--frozen-lockfile'], 'Install project dependencies');
  runForeground('docker', [...composeArguments, 'up', '--detach', '--wait'], 'Start Docker Compose services');
  runForeground(pnpmCommand, ['run', 'db:migrate:activity-ranking'], 'Apply activity ranking database migrations');

  for (const service of services) {
    await startService(service);
  }

  console.log('Application processes launched. Confirm successful startup in the service logs before sending requests.');
  console.log(`GraphQL endpoint: http://localhost:${getApiGatewayPort()}/graphql.`);
  console.log(`Logs: ${path.relative(repositoryRoot, logsDirectory)}; process IDs: ${path.relative(repositoryRoot, runtimeDirectory)}`);
}

function isProcessGroupRunning(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function stopService(name) {
  const pid = readServicePid(name);
  if (!pid) {
    console.log(`${name} is not running.`);
    return;
  }

  if (isWindows) {
    runForeground('taskkill', ['/PID', String(pid), '/T', '/F'], `Stop ${name}`);
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
    for (let attempt = 0; attempt < 20 && isProcessGroupRunning(pid); attempt += 1) {
      await sleep(100);
    }
    if (isProcessGroupRunning(pid)) process.kill(-pid, 'SIGKILL');
  }

  rmSync(servicePidPath(name), { force: true });
  console.log(`Stopped ${name} (PID ${pid}).`);
}

async function stopEnvironment() {
  ensureDirectories();
  const errors = [];
  for (const service of [...services].reverse()) {
    try {
      await stopService(service.name);
    } catch (error) {
      errors.push(error);
    }
  }

  try {
    runForeground('docker', [...composeArguments, 'down'], 'Stop Docker Compose services');
  } catch (error) {
    errors.push(error);
  }

  if (errors.length > 0) {
    throw new Error(errors.map(({ message }) => message).join('\n'));
  }
}

async function main() {
  const action = process.argv[2] ?? 'start';
  if (action === 'start') {
    await startEnvironment();
  } else if (action === 'stop') {
    await stopEnvironment();
  } else {
    throw new Error(`Unknown action "${action}". Use "start" or "stop".`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
