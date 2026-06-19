const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.resolve(projectRoot, "packages")];

// Workspace package: stable resolution (especially Windows + npm link to packages/srs).
config.resolver.extraNodeModules = {
  "@cardly/srs": path.resolve(projectRoot, "packages/srs"),
};

module.exports = config;
