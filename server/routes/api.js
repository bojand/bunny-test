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
  var n = req.param('number');

  if (n) {
    App.amqp.send('fib_queue', n, function (err, rpcRes) {
      console.log('done');
      console.log(rpcRes);
      if (err) {
        console.dir(err);
        return res.send(500);
      }

      return res.send(200, {n: rpcRes });
    });
  }
  else {
    res.send(400, 'Missing number');
  }
};

exports.cap = function (req, res) {
  res.send(200);
};