const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../shared")];
config.server.enhanceMiddleware = middleware => require("../shared/metro-api-proxy.cjs")(middleware);
module.exports = config;
