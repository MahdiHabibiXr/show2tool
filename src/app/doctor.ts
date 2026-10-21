import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

export async function doctor() {
  const candidates = process.platform === 'win32'
    ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter((value): value is string => Boolean(value)).map(base => join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
  let available = false;
  for (const candidate of candidates) {
    try { await access(candidate, constants.F_OK); available = true; break; } catch {}
  }
  const supported = Number(process.versions.node.split('.')[0]) >= 24;
  return {
    node: { version: process.versions.node, supported },
    chrome: { available, check: 'standard-installation-paths-only' },
    platform: process.platform,
    ready: supported && available,
    nextAction: !supported ? 'Install Node.js 24 or newer.' : !available ? 'Install Google Chrome in its standard location. This check does not launch it.' : 'Prerequisites found. Start with the synthetic demo; browser launch and site compatibility are separate checks.',
  };
}
