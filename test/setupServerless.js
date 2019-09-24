'use strict';

const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { ensureDir, writeJson, realpath } = require('fs-extra');
const fetch = require('node-fetch');
const tar = require('tar');
const { memoize } = require('lodash');

const spawn = (childProcessSpawn => (...args) => {
  const result = childProcessSpawn(...args);
  result.catch(error => {
    if (error.stdoutBuffer) process.stdout.write(error.stdoutBuffer);
    if (error.stderrBuffer) process.stdout.write(error.stderrBuffer);
  });
  return result;
})(require('child-process-ext/spawn'));

const tmpDir = os.tmpdir();

const resolveMode = options => {
  if (process.version.match(/\d+/)[0] < 8) return 'compiled';
  if (!options) return 'direct';
  return options.mode === 'compiled' ? 'compiled' : 'direct';
};

module.exports = memoize(async (options = {}) => {
  const serverlessTmpDir = path.join(
    tmpDir,
    `serverless-enterprise-plugin-test-serverless-${crypto.randomBytes(2).toString('hex')}`
  );
  if (process.env.LOCAL_SERVERLESS_LINK_PATH) {
    // Test against local serverless installation which is expected to have
    // this instance of `@serverless/enterprise-plugin` linked in its node_modules
    const serverlessPath = path.join(process.cwd(), process.env.LOCAL_SERVERLESS_LINK_PATH);
    let pluginPath;
    let serverlessPluginPath;
    try {
      [pluginPath, serverlessPluginPath] = await Promise.all([
        realpath(path.join(__dirname, '..')),
        realpath(path.join(serverlessPath, 'node_modules/@serverless/enterprise-plugin')),
      ]);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!pluginPath || pluginPath !== serverlessPluginPath) {
      throw new Error(
        `SERVERLESS_LINK_PATH which resolves to ${serverlessPath}, doesn't point a ` +
          'serverless installation which links this installation of a plugin'
      );
    }
    return {
      root: serverlessPath,
      binary: path.join(serverlessPath, 'bin/serverless.js'),
      plugin: pluginPath,
    };
  }
  console.info(`Setup 'serverless' at ${serverlessTmpDir}`);
  await ensureDir(serverlessTmpDir);
  console.info('... fetch tarball');
  const res = await fetch('https://github.com/serverless/serverless/archive/master.tar.gz');
  const tarDeferred = tar.x({ cwd: serverlessTmpDir, strip: 1 });
  res.body.pipe(tarDeferred);
  await new Promise((resolve, reject) => {
    res.body.on('error', reject);
    tarDeferred.on('error', reject);
    tarDeferred.on('finish', resolve);
  });

  console.info('... strip @serverless/enterprise-plugin dependency');
  const mode = resolveMode(options);
  const pluginPath = path.join(__dirname, `../${mode === 'direct' ? '' : 'dist'}`);
  const pkgJsonPath = `${serverlessTmpDir}/package.json`;
  const pkgJson = require(pkgJsonPath);
  pkgJson.dependencies['@serverless/enterprise-plugin'] = `file:${pluginPath}`;
  await writeJson(pkgJsonPath, pkgJson);

  console.info('... npm install');
  await spawn('npm', ['install', '--production'], { cwd: serverlessTmpDir });

  return {
    root: serverlessTmpDir,
    binary: path.join(serverlessTmpDir, 'bin/serverless.js'),
    plugin: await realpath(
      path.join(serverlessTmpDir, 'node_modules/@serverless/enterprise-plugin')
    ),
  };
}, resolveMode);
