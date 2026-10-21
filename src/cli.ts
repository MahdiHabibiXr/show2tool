#!/usr/bin/env node
import { handle } from './app/handlers.js';
import { failure, type Result } from './contracts/results.js';

async function main(): Promise<Result> {
  let [command, ...args] = process.argv.slice(2);
  if (command === 'call-file' && args.length === 1) {
    const { open } = await import('node:fs/promises');
    const file = await open(args[0], 'r');
    try {
      if (!(await file.stat()).isFile()) return failure('INVALID_INPUT', 'Expected a command file.');
      const buffer = Buffer.alloc(1024 * 1024 + 1);
      let size = 0;
      while (size < buffer.length) { const part = await file.read(buffer, size, buffer.length - size, null); if (!part.bytesRead) break; size += part.bytesRead; }
      if (size > 1024 * 1024) return failure('BUDGET_EXCEEDED', 'Input exceeds the 1 MiB limit.');
      command = 'call'; args = [buffer.subarray(0, size).toString('utf8')];
    } finally { await file.close(); }
  }
  if (!command || command === '--help' || command === 'help') return handle({ command: 'commands' });
  if (command === 'commands' || command === 'schema' || command === 'doctor') return args.length ? failure('INVALID_INPUT', 'Unexpected arguments.') : handle({ command });
  if (command === 'call' && args.length === 1) {
    if (Buffer.byteLength(args[0]) > 1024 * 1024) return failure('BUDGET_EXCEEDED', 'Input exceeds the 1 MiB limit.');
    try {
      const input = JSON.parse(args[0]);
      if (['compile_recordings', 'record_start', 'record_stop', 'recording', 'tools', 'run', 'run_chain', 'verify_chain', 'verify'].includes(input.command)) {
        const { callBroker } = await import('./broker/server.js');
        const { defaultStateDir } = await import('./browser/host.js');
        return callBroker(defaultStateDir(), input);
      }
      return handle(input);
    } catch { return failure('INVALID_INPUT', 'Invalid JSON input.'); }
  }
  return failure('INVALID_INPUT', 'Unknown command.', 'Call commands or schema.');
}
if (process.argv[2] === 'host' && process.argv.length === 4) {
  const { host } = await import('./browser/host.js');
  await host(process.argv[3]);
} else if (process.argv.slice(2).join(' ') === 'serve --stdio --reviewed') {
  try { await (await import('./mcp/reviewed.js')).serveReviewed(); }
  catch { console.error('Reviewed MCP could not start. Start the host, review tools, then reconnect.'); process.exitCode = 4; }
} else if (process.argv.slice(2).join(' ') === 'serve --stdio') {
  const { serve } = await import('./mcp/authoring.js');
  await serve();
} else {
  const result = await main().catch(() => failure('INVALID_INPUT', 'Command failed.'));
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = result.error.code === 'OUTCOME_UNKNOWN' ? 5 : ['REVIEW_REQUIRED', 'APPROVAL_REQUIRED', 'AUTH_REQUIRED'].includes(result.error.code) ? 3 : result.error.code === 'INVALID_INPUT' ? 2 : 4;
}
