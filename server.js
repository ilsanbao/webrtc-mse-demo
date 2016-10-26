//socket.io
var _ = require('ramda');
var http = require('http');
var socketIO = require('socket.io')();
var nodeStatic = require('node-static');
var fileServer = new(nodeStatic.Server)();

var ss = require('socket.io-stream');
var fs = require('fs');
var path = require('path');

var app = http.createServer(function(req, res) {
    fileServer.serve(req, res);
}).listen(process.env.PORT || '3000');

var io = socketIO.listen(app);

io.origins('*:*');
io.of('/video').on('connection', function (socket) {
    console.log('video peer connected');
    //connected
    socket.emit('connected', {socketId: socket.id});

    // when the user disconnects..
    socket.on('disconnect', function () {
        console.log('disconnected');
    });

    // get video stream
    ss(socket).on('video', function (stream, data) {
        console.log('start video streaming');
        var filename = path.basename(data.name);
        fs.createReadStream(filename).pipe(stream);
    });
});


//p2p connection all to all
io.of('/p2p').on('connection', function (socket) {
    console.log('p2p peer connected');
    //connected
    socket.emit('connected', {socketId: socket.id});

    //relay message
    socket.on('message', function (data) {
        console.log('got message');
        socket.broadcast.emit('message', data);
    });

    // when the user disconnects..
    socket.on('disconnect', function () {
        console.log('disconnected');
    });
});
