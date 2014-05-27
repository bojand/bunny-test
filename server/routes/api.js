exports.work = function (req, res) {
  var msg = req.param('msg') || 'Simple message to worker';

  var data = {
    message: msg
  };

  App.amqp.worker('work_queue', data, function (err) {
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
    App.amqp.rpc('fib_queue', n, function (err, rpcRes) {
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
  var msg = req.param('msg') || '';
  App.amqp.rpc('cap_queue', msg, function (err, rpcRes) {
    if (err) {
      console.dir(err);
      return res.send(500);
    }

    return res.send(rpcRes);
  });
};

exports.prog = function (req, res) {
  var msg = req.param('msg') || '';

  res.send(200);

  App.amqp.rpc('prog_queue', msg, { autoDeleteCallback: false }, function (err, rpcRes, fullMsg) {
    if (err) {
      console.dir(err);
    }

    console.dir(rpcRes);

    if (rpcRes.toString() === '100') {
      console.log('deleteing callback');
      App.amqp.deleteRpcCallback(fullMsg.properties.correlationId);
    }
  });
};

exports.pub = function (req, res) {
  var msg = req.param('msg') || 'Simple message to worker';

  App.amqp.pubsub('pubsub_logs', msg, function (err) {
    if (err) {
      console.dir(err);
      return res.send(500);
    }

    return res.send(200);
  });
};