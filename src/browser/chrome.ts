export function chromePath(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') return 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (platform === 'linux') return '/usr/bin/google-chrome';
  throw new Error('UNSUPPORTED_PLATFORM');
}
