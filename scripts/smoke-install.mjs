import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this check through npm run test:install.');
const npm = (args, cwd) => exec(process.execPath, [npmCli, ...args], { cwd, timeout: 180000, maxBuffer: 2 * 1024 * 1024 });
const dir = await mkdtemp(join(tmpdir(), 'show2tool clean install '));
try {
  await npm(['run', 'build'], root);
  const packed = JSON.parse((await npm(['pack', '--json', '--pack-destination', dir], root)).stdout)[0];
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'show2tool-install-smoke', private: true, type: 'module' }));
  await npm(['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', join(dir, packed.filename)], dir);
  const installedCommand = JSON.parse((await npm(['exec', '--offline', '--yes=false', '--', 'show2tool', 'commands'], dir)).stdout);
  assert.equal(installedCommand.ok, true, 'Consumer-local executable shim must work without network fallback');
  const cli = join(dir, 'node_modules', 'show2tool', 'dist', 'src', 'cli.js');
  for (const command of ['commands', 'schema']) {
    const result = JSON.parse((await exec(process.execPath, [cli, command], { cwd: dir })).stdout);
    assert.equal(result.ok, true, `${command} must succeed from installed package`);
  }
  const probe = join(dir, 'probe.mjs');
  await writeFile(probe, `
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/server';
import { handle } from 'show2tool';
assert.equal(typeof McpServer, 'function');
assert.equal((await handle({ command: 'commands' })).ok, true);
const candidate = await handle({ command: 'candidate', specification: { id: 'search', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', inputs: { term: { type: 'string', maxLength: 50 } }, projection: ['/items'] }, demonstrations: ['alpha','beta'].map((value,index) => ({ inputs: { term: value }, request: { id: String(index), method: 'GET', path: '/catalog', status: 200, shape: {}, queryKeys: ['q'], approvedQuery: { q: value } } })) });
assert.equal(candidate.ok, true);
console.log('Installed production dependencies and candidate compilation passed.');
`);
  const result = await exec(process.execPath, [probe], { cwd: dir });
  const client = new Client({ name: 'clean-install-smoke', version: '1.0.0' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli, 'serve', '--stdio'], cwd: dir, stderr: 'pipe' }));
    const tools = await client.listTools();
    assert.ok(tools.tools.some(tool => tool.name === 'show2tool_verify'));
    const response = await client.callTool({ name: 'show2tool_commands', arguments: {} });
    assert.equal(response.structuredContent.ok, true);
  } finally { await client.close(); }
  console.log(result.stdout.trim());
  console.log('Clean tarball installation and CLI discovery passed without workspace dependency links.');
} finally { await rm(dir, { recursive: true, force: true }); }
