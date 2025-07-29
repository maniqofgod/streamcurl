const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://api:8000',
      changeOrigin: true,
      pathRewrite: {
        '^/api': '',
      },
    })
  );
  app.use(
    '/ws',
    createProxyMiddleware({
      target: 'http://api:8000',
      ws: true,
      changeOrigin: true,
    })
  );
};