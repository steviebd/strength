const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');
config.resolver.unstable_enablePackageExports = true;

// Monorepo support: resolve modules from root node_modules. Expo's default
// config already detects workspace packages and adds them to watchFolders.
const rootNodeModules = path.resolve(__dirname, '../../node_modules');
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules'), rootNodeModules];

// Exclude Node.js-only tooling from Metro bundling. Root node_modules contains
// vite (from vitest/vite-plus), wrangler, etc. that Metro cannot transform.
config.resolver.blockList = [
  /node_modules[/\\]vite[/\\]/,
  /node_modules[/\\]vite-node[/\\]/,
  /node_modules[/\\]vitest[/\\]/,
  /node_modules[/\\]wrangler[/\\]/,
  /node_modules[/\\]@cloudflare[/\\]workers-types[/\\]/,
  // Exclude test files from Metro bundling
  /\.test\.(ts|tsx|js|jsx)$/,
];

module.exports = config;
