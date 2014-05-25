exports.work = function (req, res) {
  var msg = req.param('msg') || 'Simple message to worker';

  var data = {
    message: msg
  };

  App.amqp.send('work_queue', data, function (err) {
    console.log('done');

    if (err) {
      console.dir(err);
      return res.send(500);
    }

    return res.send(200);
  });
};

exports.fib = function (req, res) {
  res.send(200);
};

exports.cap = function (req, res) {
  res.send(200);
};