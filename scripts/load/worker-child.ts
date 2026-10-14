import { spawn, ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';

export async function startWorker(
  service: string,
  environment: NodeJS.ProcessEnv,
  directory: string,
): Promise<ChildProcess> {
  const child = spawn(
    process.execPath,
    [join(__dirname, 'worker-process.js'), service],
    { env: environment, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
  );
  const log = createWriteStream(
    join(directory, `${service}-${Date.now()}.log`),
  );
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  child.once('exit', () => log.end());
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => finish(new Error('Worker startup timed out')),
        30_000,
      );
      const onMessage = (message: { kind: string }) => {
        if (message.kind === 'ready') finish();
        else if (message.kind === 'fatal')
          finish(new Error('Worker startup failed'));
      };
      const onExit = () => finish(new Error('Worker exited before readiness'));
      const finish = (error?: Error) => {
        clearTimeout(timer);
        child.off('message', onMessage);
        child.off('exit', onExit);
        child.off('error', finish);
        if (error) reject(error);
        else resolve();
      };
      child.on('message', onMessage);
      child.once('exit', onExit);
      child.once('error', finish);
    });
    return child;
  } catch (error) {
    child.kill();
    throw error;
  }
}

let nextRequestId = 0;
export function workerStats(
  child: ChildProcess,
  kind: 'reset' | 'snapshot',
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const requestId = ++nextRequestId;
    const timer = setTimeout(() => {
      child.off('message', onMessage);
      reject(new Error('Worker metrics timed out'));
    }, 5000);
    const onMessage = (message: {
      kind: string;
      requestId: number;
      metrics: unknown;
    }) => {
      if (message.kind !== 'stats' || message.requestId !== requestId) return;
      clearTimeout(timer);
      child.off('message', onMessage);
      resolve(message.metrics);
    };
    child.on('message', onMessage);
    child.send({ kind, requestId }, (error) => {
      if (!error) return;
      clearTimeout(timer);
      child.off('message', onMessage);
      reject(error);
    });
  });
}

export async function stopWorker(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || !child.connected) {
    child.kill();
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill();
      resolve();
    }, 10_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.send({ kind: 'shutdown' });
  });
}
