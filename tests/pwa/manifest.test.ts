import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = process.cwd();

test('manifest describes the installable Daleel shell without offline answer claims', async () => {
  const manifest = JSON.parse(await readFile(`${root}/public/manifest.webmanifest`, 'utf8'));

  assert.equal(manifest.name, 'Daleel | دليل');
  assert.equal(manifest.short_name, 'دليل');
  assert.equal(manifest.start_url, '/#/chat');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'ar');
  assert.equal(manifest.dir, 'rtl');
  assert.equal(JSON.stringify(manifest).toLowerCase().includes('offline'), false);
  assert.deepEqual(
    manifest.icons.map(({ purpose, sizes }: { purpose: string; sizes: string }) => [sizes, purpose]),
    [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']],
  );
});

test('generated PNG icons have their declared dimensions', async () => {
  assert.deepEqual(await readPngDimensions('public/icons/daleel-192.png'), [192, 192]);
  assert.deepEqual(await readPngDimensions('public/icons/daleel-512.png'), [512, 512]);
  assert.deepEqual(await readPngDimensions('public/icons/daleel-maskable-512.png'), [512, 512]);
});

test('HTML exposes the manifest and mobile metadata', async () => {
  const html = await readFile(`${root}/index.html`, 'utf8');
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes" \/>/);
  assert.match(html, /<meta name="description" content="[^"]+" \/>/);
  assert.match(html, /<meta name="theme-color" content="#0b4f35" \/>/);
});

async function readPngDimensions(relativePath: string): Promise<[number, number]> {
  const png = await readFile(`${root}/${relativePath}`);
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}
