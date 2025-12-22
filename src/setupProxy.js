// Use compatible import for different http-proxy-middleware versions
const proxyModule = require('http-proxy-middleware');
const createProxy = proxyModule.createProxyMiddleware || proxyModule;

module.exports = function(app) {
  app.use(
    '/api',
    createProxy({
      target: 'http://localhost:5000',
      changeOrigin: true,
      ws: true,
      logLevel: 'silent'
    })
  );
};