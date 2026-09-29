const { getDefaultConfig } = require('expo/metro-config');
const { createHash } = require('node:crypto');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Expo embeds public environment variables in transformed modules. Include them
// in Metro's cache key so switching environments cannot reuse an old login client.
const publicConfig = [process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY];
const configHash = createHash('sha256').update(JSON.stringify(publicConfig)).digest('hex');
config.cacheVersion = `${config.cacheVersion || ''}-${configHash}`;

module.exports = config;
