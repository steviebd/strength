const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');
config.resolver.unstable_enablePackageExports = true;

// Monorepo support: resolve modules from root node_modules. Expo's default
// config already detects workspace packages and adds them to watchFolders.
const rootNodeModules = path.resolve(__dirname, '../../node_modules');
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules'), rootNodeModules];

module.exports = config;
