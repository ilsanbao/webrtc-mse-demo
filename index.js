var SimplePeer = require('simple-peer');
var io = require('socket.io-client');
var ss = require('socket.io-stream');
var MediaElementWrapper = require('mediasource');

var peer = new SimplePeer({
    initiator: location.hash === '#1', trickle: false, config: {
        iceServers: [
            {
                urls: 'stun:stun.stunprotocol.org'
            }
        ]
    }
});
var pSocket = io.connect('localhost:3000/p2p');

peer.on('error', function (err) {
    console.log('error', err)
});

peer.on('signal', function (data) {
    console.log('SIGNAL', JSON.stringify(data));
    pSocket.emit(data.type, data);
});

pSocket.on('send_offer', function (data) {
    peer.signal(data);
});

pSocket.on('send_answer', function (data) {
    peer.signal(data);
});

peer.on('data', function (data) {
    console.log('received data length: ' + data.length);
    if (data == 'end') {
        writable.end();
    } else {
        writable.write(data);
    }
});

peer.on('connect', function () {
    console.log('CONNECT', JSON.stringify(peer.address()), peer.initiator);
    //p.send('whatever' + Math.random())
    if (peer.initiator) { //fetch from server and send data to other peers
        var vSocket = io.connect('localhost:3000/video');
        var vStream = ss.createStream();
        ss(vSocket).emit('video', vStream, {name: 'frag_bunny.mp4'});

        vStream.on('data', function (chunk) {
            console.log('chunk length: ', chunk.length);
            peer.send(chunk);
            writable.write(chunk);
        });
        vStream.on('finish', function () {
            peer.send('end');
            writable.end();
        })
    }
});

function createElem(tagName) {
    var elem = document.createElement(tagName);
    elem.controls = true;
    elem.autoplay = true; // for chrome
    //elem.play(); // for firefox
    document.body.appendChild(elem);
    return elem
}

var elem = createElem('video');
var wrapper = new MediaElementWrapper(elem);
// The correct mime type, including codecs, must be provided
var writable = wrapper.createWriteStream('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');

elem.addEventListener('error', function () {
    // listen for errors on the video/audio element directly
    var errorCode = '';//elem.error && elem.error();
    var detailedError = wrapper.detailedError;
    console.log(errorCode, detailedError);
    // wrapper.detailedError will often have a more detailed error message
});

writable.on('error', function (err) {
    console.log(err);
});

//vStream.pipe(writable);
