//socket.io
var _ = require('ramda');
var io = require('socket.io')();
var ss = require('socket.io-stream');
var fs = require('fs');
var path = require('path');

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

    //offer
    socket.on('offer', function (data) {
        console.log('receive offer');
        socket.broadcast.emit('send_offer', data);
    });

    //answer
    socket.on('answer', function (data) {
        console.log('receive answer');
        socket.broadcast.emit('send_answer', data);
    });

    // when the user disconnects..
    socket.on('disconnect', function () {
        console.log('disconnected');
    });
});

io.listen(process.env.PORT || '3000');
