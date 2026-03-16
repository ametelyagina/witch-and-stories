import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4173;

function getNpxCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

export async function startPreviewServer({
  cwd,
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
} = {}) {
  const command = getNpxCommand();
  const url = `http://${host}:${port}/`;
  let output = '';

  const child = spawn(
    command,
    ['vite', 'preview', '--host', host, '--port', String(port), '--strictPort'],
    {
      cwd,
      env: {
        ...process.env,
        CI: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const appendOutput = (chunk) => {
    output += chunk.toString();
  };

  child.stdout.on('data', appendOutput);
  child.stderr.on('data', appendOutput);

  await waitForServer(url, child, () => output);

  return {
    output,
    url,
    async stop() {
      if (child.exitCode !== null) {
        return;
      }

      child.kill('SIGTERM');

      for (let index = 0; index < 20; index += 1) {
        if (child.exitCode !== null) {
          return;
        }

        await delay(100);
      }

      child.kill('SIGKILL');
    },
  };
}

async function waitForServer(url, child, getOutput) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Vite preview exited early.\n${getOutput()}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // server is still starting
    }

    await delay(200);
  }

  throw new Error(`Timed out waiting for Vite preview at ${url}.\n${getOutput()}`);
}
