var api = require('./api');

module.exports = function (app) {
  app.post('/fib', api.fib);
  app.post('/work', api.work);
  app.get('/cap', api.cap);
};