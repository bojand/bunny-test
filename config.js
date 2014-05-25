var config = {
  env: process.env.NODE_ENV || 'local',
  port: 3000,
  amqp_rul: 'amqp://guest:guest@localhost:5672//'
};

module.exports = config;