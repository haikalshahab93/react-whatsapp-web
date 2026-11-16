// Use compatible import for different http-proxy-middleware versions
const proxyModule = require("http-proxy-middleware");
const createProxy = proxyModule.createProxyMiddleware || proxyModule;

const target = process.env.REACT_APP_PROXY_TARGET || "http://localhost:5000";

module.exports = function (app) {
  app.use(
    "/api",
    createProxy({
      target,
      changeOrigin: true,
      ws: true,
      logLevel: "silent",
    })
  );

  // Socket.IO shares the browser origin in dev and in production, so it must be proxied too.
  app.use(
    "/socket.io",
    createProxy({
      target,
      changeOrigin: true,
      ws: true,
      logLevel: "silent",
    })
  );
};
