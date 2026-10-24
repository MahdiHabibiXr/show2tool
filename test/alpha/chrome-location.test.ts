import { it, expect } from 'vitest';
import { chromePath } from '../../src/browser/chrome.js';
it('resolves platform standard Chrome binaries without hardcoding Windows in tests', () => {
  expect(chromePath('win32')).toBe('C:/Program Files/Google/Chrome/Application/chrome.exe');
  expect(chromePath('linux')).toBe('/usr/bin/google-chrome');
  expect(chromePath('darwin')).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
});
