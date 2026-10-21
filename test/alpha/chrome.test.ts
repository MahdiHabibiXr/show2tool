import { it, expect } from 'vitest';
import { chromeCandidates } from '../../src/browser/chrome.js';
it('matches standard Playwright Chrome locations without guessing from user profile', () => {
  expect(chromeCandidates('linux', {})).toEqual(['/opt/google/chrome/chrome']);
  expect(chromeCandidates('darwin', {})).toEqual(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']);
  expect(chromeCandidates('win32', { PROGRAMFILES: 'C:/Programs', LOCALAPPDATA: 'C:/Local' })).toEqual(['C:/Local/Google/Chrome/Application/chrome.exe', 'C:/Programs/Google/Chrome/Application/chrome.exe']);
});
