module.exports = Client;

var debug = require('debug')('kiwi-web-client');
var Peer = require('simple-peer');
var randombytes = require('randombytes');
var io = require('socket.io-client');
var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')

const OFFER_TIMEOUT = 3000;
const CLIENT_VERSION = 0;

inherits(Client, EventEmitter)

function Client(opts) {
    if (!opts) {
        console.error('must have options parameter')
        return;
    }
    var self = this;
    if (!(self instanceof Client)) return new Client(opts)
    EventEmitter.call(self)

    self.client_id = opts.client_id || randombytes(23).toString('hex');
    debug(`my cilent id is: ${self.client_id}`);
    self.ws_addr = opts.addr || 'localhost:3000/tracker';
    self.report_interval = opts.report_interval || 3000;

    self.peers = {};//offer_id -> peer
    self.ws_conn = null; //websocket to server
    self.piecer_ok_percent = 0;
    self._peers_num = 0;
    self._peers_connected_num = 0;

    self._openSocket();
    self._reportStatus();
    self._send({type: 'register', client_id: self.client_id});
}

Client.prototype._reportStatus = function () {
    var self = this;
    setInterval(() => {
        var data = {
            type: 'status',
            piecer_ok_percent: (self._peers_num > 0 ? self._peers_connected_num / self._peers_num : 0),
            upload_kbs: 0 //todo
        };
        self._send(data);
    }, self.report_interval);
};

Client.prototype._openSocket = function () {
    var self = this;
    self.ws_conn = io.connect(self.ws_addr);
    self.ws_conn.on('message', self._onSocketMessage.bind(self));
};

Client.prototype._send = function (params) {
    debug('send message to server: ', JSON.stringify(params));
    this.ws_conn.emit('message', params);
};

Client.prototype._destroy = function () {
    var self = this;
    for (var oid in self.peers) {
        self.peers[oid] && self.peers[oid].destroy();
    }
    self.peers = {};
    clearInterval();
    self.ws_conn && self.ws_conn.destroy();
};


Client.prototype._generateOffers = function (numwant, cb) {
    var self = this;
    var offers = [];
    debug('generating %s offers', numwant);

    for (var i = 0; i < numwant; ++i) {
        generateOffer()
    }
    checkDone();

    function generateOffer() {
        var offerId = randombytes(20).toString('hex');
        debug('creating peer (from _generateOffers)');
        var peer = self.peers[offerId] = new Peer({
            initiator: true,
            trickle: false
        });
        self._peers_num++;
        peer.once('signal', function (offer) {
            offers.push({
                offer: offer,
                offer_id: offerId
            });
            checkDone()
        });
        peer.offerTimeout = setTimeout(function () {
            debug('tracker timeout: destroying peer');
            peer.trackerTimeout = null;
            delete self.peers[offerId];
            self._peers_num--;
            peer.destroy()
        }, OFFER_TIMEOUT);
        peer.offerTimeout.unref && peer.offerTimeout.unref();
    }

    function checkDone() {
        if (offers.length === numwant) {
            debug('generated %s offers', numwant);
            cb(offers)
        }
    }
};

Client.prototype._handleGenOfferMessage = function (data) {
    var self = this;
    self._generateOffers(data.numwant, function (offers) {
        if (offers && offers.length > 0) {
            self._send({type: 'offers', offers: offers, client_id: self.client_id});
        }
    });
};


Client.prototype._handleSdpMessage = function (data) {
    var self = this;
    if (data.client_id && data.client_id == self.client_id) {
        return;
    }
    var peer;
    if (data.offer && data.client_id) {
        debug('creating peer (from remote offer)');
        peer = self.peers[data.offer_id] = new Peer({trickle: false});
        self._peers_num++;
        peer.owner_id =  self.client_id;
        peer.signal(data.offer);
        peer.once('signal', function (answer) {
            var params = {
                type: 'sdp',
                client_id: self.client_id,
                to_client_id: data.client_id,
                answer: answer,
                offer_id: data.offer_id
            };
            self._send(params);
        });
        peer.on('connect', function () {
            self._peers_connected_num++;
            self.emit('peer', peer);
            debug(`client ${data.client_id} to me connected successful!`);
        });
    }

    if (data.answer && data.client_id) {
        var offerId = data.offer_id;
        peer = self.peers[offerId];
        if (peer) {
            peer.owner_id = self.client_id;
            peer.signal(data.answer);
            peer.on('connect', function () {
                self._peers_connected_num++;
                self.emit('peer', peer);
                debug(`client i to ${data.client_id} connected successful!`);
            });
            clearTimeout(peer.offerTimeout);
            peer.offerTimeout = null;
            delete self.peers[offerId]
        } else {
            debug('got unexpected answer: ' + JSON.stringify(data.answer))
        }
    }
};

//data: {type: 'sdp', offer: {}, peer_id: 'xxx'}
Client.prototype._onSocketMessage = function (data) {
    debug(`received server message: ${JSON.stringify(data)}`);
    var self = this;
    if (!data.type) {
        return;
    }
    switch (data.type) {
        case 'sdp':
            self._handleSdpMessage(data);
            break;
        case 'gen_offer':
            self._handleGenOfferMessage(data);
            break;
    }
};
