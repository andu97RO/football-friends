import { readFileSync, readdirSync } from 'node:fs';
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

console.log('Web export contains the expected public Supabase configuration');
