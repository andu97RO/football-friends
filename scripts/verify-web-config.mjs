import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || url.includes('example.supabase.co') || key.includes('placeholder')) {
  throw new Error('The web build needs real public Supabase configuration');
}

const bundleDir = join('dist', '_expo', 'static', 'js', 'web');
const bundles = readdirSync(bundleDir).filter((name) => name.endsWith('.js'));
const configuredClient = bundles.some((name) => {
  const bundle = readFileSync(join(bundleDir, name), 'utf8');
  const client = bundle.match(/createClient\)\(([^\n]{0,1000}?)\{auth:/);
  return client && client[1].includes(url) && client[1].includes(key);
});

if (!configuredClient) {
  throw new Error('The exported login client does not contain the expected Supabase URL and public key');
}

// The installable app: manifest, service worker and every icon the manifest and the iOS home screen use.
const manifest = JSON.parse(readFileSync(join('dist', 'manifest.webmanifest'), 'utf8'));
const pwaFiles = ['sw.js', 'icons/apple-touch-icon.png', 'icons/favicon-48.png', ...manifest.icons.map((icon) => icon.src.replace(/^\//, ''))];
const missing = pwaFiles.filter((file) => !existsSync(join('dist', file)));
if (missing.length) throw new Error(`The web export is missing PWA files: ${missing.join(', ')}`);
if (!readFileSync(join('dist', 'index.html'), 'utf8').includes('rel="manifest"')) {
  throw new Error('The exported index.html does not link the web app manifest');
}

console.log('Web export contains the expected public Supabase configuration and the installable app files');
