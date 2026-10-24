import { it, expect } from 'vitest';
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
it('keeps translated commands and local links in parity', async () => {
  const paths = ['README.md', ...['fa', 'ar', 'es', 'zh-CN'].map(language => `docs/i18n/README.${language}.md`)];
  const english = await readFile(paths[0], 'utf8');
  const commands = (text: string) => [...text.matchAll(/```sh\r?\n([\s\S]*?)```/g)].map(match => match[1].replace(/\r/g, '').split('\n').filter(line => !line.trim().startsWith('#') && line.trim()).join('\n'));
  for (const path of paths) {
    const text = await readFile(path, 'utf8');
    expect(commands(text)).toEqual(commands(english));
    for (const match of text.matchAll(/\]\(([^)]+)\)|src="([^"]+)"/g)) {
      const link = match[1] || match[2];
      if (link.startsWith('http') || link.startsWith('#')) continue;
      await expect(access(resolve(dirname(path), link.split('#')[0]))).resolves.toBeUndefined();
    }
    for (const language of ['fa', 'ar', 'es', 'zh-CN']) expect(text).toContain(`README.${language}.md`);
  }
});
