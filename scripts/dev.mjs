import chokidar from 'chokidar';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const cwd = process.cwd();
const registerModule = pathToFileURL(resolve(cwd, 'scripts/register-ts-node.mjs')).href;
const entrypoint = resolve(cwd, 'src/index.ts');
const watchTargets = ['src/**/*.ts', '.env', 'tsconfig.json'];
const usePolling = String(process.env.CHOKIDAR_USEPOLLING ?? 'true').toLowerCase() !== 'false';

let child;
let restartTimer;
let restartChain = Promise.resolve();
let shuttingDown = false;

function log(message) {
  process.stdout.write(`[dev] ${message}\n`);
}

function startServer() {
  const current = spawn(process.execPath, ['--import', registerModule, entrypoint], {
    cwd,
    env: {
      ...process.env,
      TS_NODE_PROJECT: resolve(cwd, 'tsconfig.json'),
      TS_NODE_TRANSPILE_ONLY: process.env.TS_NODE_TRANSPILE_ONLY ?? 'true',
    },
    stdio: 'inherit',
  });

  child = current;
  current.on('exit', (code, signal) => {
    if (child === current) {
      child = undefined;
    }

    if (shuttingDown) {
      return;
    }

    if (signal) {
      log(`server exited with signal ${signal}`);
      return;
    }

    if ((code ?? 0) !== 0) {
      log(`server exited with code ${code}`);
    }
  });
}

function stopServer() {
  const current = child;
  child = undefined;

  if (!current) {
    return Promise.resolve();
  }

  if (current.exitCode !== null || current.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolveStop) => {
    const killTimer = setTimeout(() => {
      if (current.exitCode === null && current.signalCode === null) {
        current.kill('SIGKILL');
      }
    }, 5_000);

    current.once('exit', () => {
      clearTimeout(killTimer);
      resolveStop();
    });

    current.kill('SIGTERM');
  });
}

function queueRestart(reason) {
  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartChain = restartChain
      .then(async () => {
        if (shuttingDown) {
          return;
        }

        log(`restarting after ${reason}`);
        await stopServer();

        if (!shuttingDown) {
          startServer();
        }
      })
      .catch((error) => {
        console.error('[dev] restart failed', error);
      });
  }, 120);
}

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  log(`shutting down (${signal})`);
  await watcher.close();
  await stopServer();
  process.exit(exitCode);
}

const watcher = chokidar.watch(watchTargets, {
  cwd,
  ignoreInitial: true,
  ignored: ['dist/**', 'logs/**', 'node_modules/**'],
  usePolling,
  interval: 250,
});

watcher.on('all', (event, changedPath) => {
  queueRestart(`${event} ${changedPath}`);
});

watcher.on('error', (error) => {
  console.error('[dev] watcher error', error);
  void shutdown('watcher error', 1);
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

log(`watching ${watchTargets.join(', ')}`);
startServer();
