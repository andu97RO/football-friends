const { existsSync } = require('node:fs');

/**
 * Static settings live in app.json. This file only adds what depends on the
 * build machine:
 * - Firebase's google-services.json, which Android needs for push. EAS builds
 *   get it from the GOOGLE_SERVICES_JSON file variable; local builds use the
 *   file in the project root if it exists. It is never committed.
 */
module.exports = ({ config }) => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON || (existsSync('./google-services.json') ? './google-services.json' : undefined);
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
