const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.projectRoot = __dirname;
config.watchFolders = [__dirname, '/home/steven/strength'];
config.resolver.nodeModulesPaths = [
  '/home/steven/strength/node_modules',
  __dirname + '/node_modules'
];

module.exports = config;