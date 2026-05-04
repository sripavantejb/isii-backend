const path = require('path');
const dotenv = require('dotenv');

let hasLoadedEnv = false;

const resolveEnvPath = () => {
  const configuredPath = process.env.ENV_FILE;

  if (!configuredPath) {
    return path.resolve(__dirname, '..', '.env');
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(__dirname, '..', configuredPath);
};

const loadEnv = () => {
  if (hasLoadedEnv) {
    return;
  }

  dotenv.config({ path: resolveEnvPath() });
  hasLoadedEnv = true;
};

loadEnv();

module.exports = loadEnv;
