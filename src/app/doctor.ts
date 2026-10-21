import { findChrome } from '../browser/chrome.js';

export async function doctor() {
  const available = Boolean(await findChrome());
  const supported = Number(process.versions.node.split('.')[0]) >= 24;
  return {
    node: { version: process.versions.node, supported },
    chrome: { available, check: 'standard-installation-paths-only' },
    platform: process.platform,
    ready: supported && available,
    nextAction: !supported ? 'Install Node.js 24 or newer.' : !available ? 'Install Google Chrome in its standard location. This check does not launch it.' : 'Prerequisites found. Start with the synthetic demo; browser launch and site compatibility are separate checks.',
  };
}
