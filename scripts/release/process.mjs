import { spawn } from 'node:child_process';

/** Run a release subprocess without a shell while preserving interactive npm authentication. */
export function runCommand(command, args, { cwd, capture = false, env = process.env } = {}) {
  const npmCli = process.env.npm_execpath;
  const nativeNpm = command === 'npm' && npmCli?.endsWith('npm-cli.js');
  return new Promise((resolve, reject) => {
    const child = spawn(nativeNpm ? process.execPath : command, nativeNpm ? [npmCli, ...args] : args, {
      cwd,
      env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} ${args[0]} failed (exit ${code}).${capture && stderr ? `\n${stderr.trim()}` : ''}`));
    });
  });
}
