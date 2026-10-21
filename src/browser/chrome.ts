import { access } from 'node:fs/promises';
import { posix } from 'node:path';
export function chromeCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === 'darwin') return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  if (platform === 'linux') return ['/opt/google/chrome/chrome'];
  if (platform !== 'win32') return [];
  const prefixes = [env.LOCALAPPDATA, env.PROGRAMFILES, env['PROGRAMFILES(X86)'], ...(env.HOMEDRIVE ? [`${env.HOMEDRIVE}/Program Files`, `${env.HOMEDRIVE}/Program Files (x86)`] : [])];
  return [...new Set(prefixes.filter((value): value is string => Boolean(value)).map(prefix => posix.join(prefix.replaceAll('\\', '/'), 'Google/Chrome/Application/chrome.exe')))];
}
export async function findChrome(): Promise<string | undefined> {
  for (const candidate of chromeCandidates(process.platform, process.env)) {
    try { await access(candidate); return candidate; } catch {}
  }
  return undefined;
}
