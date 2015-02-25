!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.kurentoUtils=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
 * (C) Copyright 2014 Kurento (http://kurento.org/)
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the GNU Lesser General Public License
 * (LGPL) version 2.1 which accompanies this distribution, and is available at
 * http://www.gnu.org/licenses/lgpl-2.1.html
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 */

var freeice  = require('freeice');
var inherits = require('inherits');

var EventEmitter = require('events').EventEmitter;

var recursive = require('merge').recursive


const MEDIA_CONSTRAINTS =
{
  audio: true,
  video:
  {
    mandatory:
    {
      maxWidth: 640,
      maxFrameRate: 15,
      minFrameRate: 15
    }
  }
}


function noop(error)
{
  if(error)
  {
    if(console.trace)
      return console.trace(error)

    console.error(error)
  }
}

function trackStop(track)
{
  track.stop && track.stop()
}

function streamStop(stream)
{
  stream.getTracks().forEach(trackStop)
}


/**
 * @classdesc Wrapper object of an RTCPeerConnection. This object is aimed to
 *            simplify the development of WebRTC-based applications.
 *
 * @constructor module:kurentoUtils.WebRtcPeer
 *
 * @param mode -
 *            {String} Mode in which the PeerConnection will be configured.
 *            Valid values are: 'recv', 'send', and 'sendRecv'
 * @param localVideo -
 *            {Object} Video tag for the local stream
 * @param remoteVideo -
 *            {Object} Video tag for the remote stream
 * @param onsdpoffer -
 *            {Function} Callback executed when a SDP offer has been generated
 * @param onerror -
 *            {Function} Callback executed when an error happens generating an
 *            SDP offer
 * @param videoStream -
 *            {Object} MediaStream to be used as primary source (typically video
 *            and audio, or only video if combined with audioStream) for
 *            localVideo and to be added as stream to the RTCPeerConnection
 * @param audioStream -
 *            {Object} MediaStream to be used as second source (typically for
 *            audio) for localVideo and to be added as stream to the
 *            RTCPeerConnection
 */
function WebRtcPeer(mode, options, callback)
{
  WebRtcPeer.super_.call(this)

  var localVideo, remoteVideo, onsdpoffer, onerror, mediaConstraints;
  var videoStream, audioStream, connectionConstraints;
  var pc, sendSource;

  var configuration = recursive(
  {
    iceServers: freeice()
  },
  WebRtcPeer.prototype.server);


  switch(mode)
  {
    case 'recv': mode = 'recvonly'; break
    case 'send': mode = 'sendonly'; break
  }


  while(arguments.length && !arguments[arguments.length-1]) arguments.length--;

  if(arguments.length > 3)  // Deprecated mode
  {
    console.warn('Positional parameters are deprecated for WebRtcPeer')

    localVideo       = arguments[1];
    remoteVideo      = arguments[2];
    onsdpoffer       = arguments[3];
    onerror          = arguments[4];
    mediaConstraints = arguments[5];
    videoStream      = arguments[6];
    audioStream      = arguments[7];
  }
  else
  {
    if(options instanceof Function)
    {
      callback = options
      options = undefined
    }

    options = options || {}

    localVideo       = options.localVideo;
    remoteVideo      = options.remoteVideo;
    onsdpoffer       = options.onsdpoffer;
    onerror          = options.onerror;
    onicecandidate   = options.onicecandidate;
    mediaConstraints = options.mediaConstraints;
    videoStream      = options.videoStream;
    audioStream      = options.audioStream;

    connectionConstraints = options.connectionConstraints;
    pc                    = options.peerConnection
    sendSource            = options.sendSource || 'webcam'

    configuration = recursive(configuration, options.configuration);
  }

  if(onerror)    this.on('error',    onerror);
  if(onsdpoffer) this.on('sdpoffer', onsdpoffer);
  if(onicecandidate) this.on('icecandidate', onicecandidate);


  // Init PeerConnection

  if(!pc) pc = new RTCPeerConnection(configuration);

  Object.defineProperty(this, 'peerConnection', {get: function(){return pc;}});

  var self = this;

  function onSdpOffer_callback(error, sdpAnswer, callback)
  {
    if(error) return console.error(error)

    self.processSdpAnswer(sdpAnswer, callback)
  }

  pc.addEventListener('icecandidate', function(event)
  {
    if(event.candidate)
      self.emit('icecandidate', event.candidate);
  });


  //
  // Priviledged methods
  //

  /**
  * @description This method creates the RTCPeerConnection object taking into
  *              account the properties received in the constructor. It starts
  *              the SDP negotiation process: generates the SDP offer and invokes
  *              the onsdpoffer callback. This callback is expected to send the
  *              SDP offer, in order to obtain an SDP answer from another peer.
  *
  * @function module:kurentoUtils.WebRtcPeer.prototype.start
  */
  this.start = function(constraints, callback)
  {
    if(videoStream && localVideo)
    {
      localVideo.src = URL.createObjectURL(videoStream);
      localVideo.muted = true;
    }

    if(videoStream) pc.addStream(videoStream);
    if(audioStream) pc.addStream(audioStream);

    // Adjust arguments

    if(constraints instanceof Function)
    {
      if(callback) throw new Error('Nothing can be defined after the callback')

      callback    = constraints
      constraints = undefined
    }

    // [Hack] https://code.google.com/p/chromium/issues/detail?id=443558
    if(mode == 'sendonly') mode = 'sendrecv';

    constraints = recursive(
    {
      mandatory:
      {
        OfferToReceiveAudio: (mode !== 'sendonly'),
        OfferToReceiveVideo: (mode !== 'sendonly')
      },
      optional:
      [
        {DtlsSrtpKeyAgreement: true}
      ]
    }, constraints);

    console.log('constraints: '+JSON.stringify(constraints));

    callback = (callback || noop).bind(this);


    // Create the offer with the required constraints

    pc.createOffer(function(offer)
    {
      console.log('Created SDP offer');

      pc.setLocalDescription(offer, function()
      {
        console.log('Local description set', offer);

        self.emit('sdpoffer', offer.sdp, onSdpOffer_callback);

        callback(null, self, offer);
      },
      callback);
    },
    callback, constraints);
  }


  callback = (callback || noop).bind(this)

  function getMedia(constraints)
  {
    getUserMedia(recursive(MEDIA_CONSTRAINTS, constraints), function(stream)
    {
      videoStream = stream;

      self.start(connectionConstraints, callback)
    },
    callback);
  }

  if(mode !== 'recvonly' && !videoStream && !audioStream)
  {
    if(sendSource && sendSource != 'webcam' && !mediaConstraints)
      getScreenConstraints(sendMode, function(error, constraints)
      {
        if(error) return callback(error)

        getMedia(constraints)
      })

    else
      getMedia(mediaConstraints)
  }
  else
    self.start(connectionConstraints, callback)


  this.on('_dispose', function()
  {
    if(localVideo)  localVideo.src  = '';
    if(remoteVideo) remoteVideo.src = '';
  })

  this.on('_processSdpAnswer', function(url)
  {
    if(remoteVideo)
    {
      remoteVideo.src = url;

      console.log('Remote URL:', url)
    }
  })


  Object.defineProperty(this, 'enabled',
  {
    enumerable: true,
    get: function()
    {
      return this.audioEnabled && this.videoEnabled;
    },
    set: function(value)
    {
      this.audioEnabled = this.videoEnabled = value
    }
  })

  Object.defineProperty(this, 'audioEnabled',
  {
    enumerable: true,
    get: function()
    {
      if(!this.peerConnection) return;

      var streams = this.peerConnection.getLocalStreams();
      if(!streams.length) return;

      for(var i=0,stream; stream=streams[i]; i++)
        for(var j=0,track; track=stream.getAudioTracks()[j]; j++)
          if(!track.enabled)
            return false;

      return true;
    },
    set: function(value)
    {
      this.peerConnection.getLocalStreams().forEach(function(stream)
      {
        stream.getAudioTracks().forEach(function(track)
        {
          track.enabled = value;
        })
      })
    }
  })

  Object.defineProperty(this, 'videoEnabled',
  {
    enumerable: true,
    get: function()
    {
      if(!this.peerConnection) return;

      var streams = this.peerConnection.getLocalStreams();
      if(!streams.length) return;

      for(var i=0,stream; stream=streams[i]; i++)
        for(var j=0,track; track=stream.getVideoTracks()[j]; j++)
          if(!track.enabled)
            return false;

      return true;
    },
    set: function(value)
    {
      this.peerConnection.getLocalStreams().forEach(function(stream)
      {
        stream.getVideoTracks().forEach(function(track)
        {
          track.enabled = value;
        })
      })
    }
  })
}
inherits(WebRtcPeer, EventEmitter)


WebRtcPeer.prototype.server = {}


/**
 * Callback function invoked when an ICE candidate is received. Developers are
 * expected to invoke this function in order to complete the SDP negotiation.
 *
 * @function module:kurentoUtils.WebRtcPeer.prototype.addIceCandidate
 *
 * @param iceCandidate - Literal object with the ICE candidate description
 * @param callback - Called when the ICE candidate has been added.
 */
WebRtcPeer.prototype.addIceCandidate = function(iceCandidate, callback)
{
	var candidate = new RTCIceCandidate(iceCandidate);

	console.log('ICE candidate received');

	callback = (callback || noop).bind(this)

	this.peerConnection.addIceCandidate(candidate, callback, callback);
}

WebRtcPeer.prototype.getLocalStream = function(index)
{
  if(this.peerConnection)
    return this.peerConnection.getLocalStreams()[index || 0]
}

WebRtcPeer.prototype.getRemoteStream = function(index)
{
  if(this.peerConnection)
    return this.peerConnection.getRemoteStreams()[index || 0]
}

/**
* @description This method frees the resources used by WebRtcPeer.
*
* @function module:kurentoUtils.WebRtcPeer.prototype.dispose
*/
WebRtcPeer.prototype.dispose = function()
{
  console.log('Disposing WebRtcPeer');

  var pc = this.peerConnection;
  if(pc)
  {
    if(pc.signalingState == 'closed') return

    pc.getLocalStreams().forEach(streamStop)

    // FIXME This is not yet implemented in firefox
    // if(videoStream) pc.removeStream(videoStream);
    // if(audioStream) pc.removeStream(audioStream);

    pc.close();
  }

  this.emit('_dispose');
};


/**
 * Callback function invoked when a SDP answer is received. Developers are
 * expected to invoke this function in order to complete the SDP negotiation.
 *
 * @function module:kurentoUtils.WebRtcPeer.prototype.processSdpAnswer
 *
 * @param sdpAnswer - Description of sdpAnswer
 * @param callback - Called when the remote description has been set
 *  successfully.
 */
WebRtcPeer.prototype.processSdpAnswer = function(sdpAnswer, callback)
{
  var answer = new RTCSessionDescription(
  {
    type : 'answer',
    sdp : sdpAnswer,
  });

  console.log('SDP answer received, setting remote description');

  callback = (callback || noop).bind(this)

  var pc = this.peerConnection;
  if(pc.signalingState == 'closed')
    return callback('PeerConnection is closed')

  var self = this;

  pc.setRemoteDescription(answer, function()
  {
    var stream = pc.getRemoteStreams()[0]

    var url = stream ? URL.createObjectURL(stream) : "";

    self.emit('_processSdpAnswer', url);

    callback();
  },
  callback);
}


//
// Static factory functions
//

/**
 * @description This method creates the WebRtcPeer object and obtain userMedia
 *              if needed.
 *
 * @function module:kurentoUtils.WebRtcPeer.start
 *
 * @param mode -
 *            {String} Mode in which the PeerConnection will be configured.
 *            Valid values are: 'recv', 'send', and 'sendRecv'
 * @param localVideo -
 *            {Object} Video tag for the local stream
 * @param remoteVideo -
 *            {Object} Video tag for the remote stream
 * @param onSdp -
 *            {Function} Callback executed when a SDP offer has been generated
 * @param onerror -
 *            {Function} Callback executed when an error happens generating an
 *            SDP offer
 * @param mediaConstraints -
 *            {Object[]} Constraints used to create RTCPeerConnection
 * @param videoStream -
 *            {Object} MediaStream to be used as primary source (typically video
 *            and audio, or only video if combined with audioStream) for
 *            localVideo and to be added as stream to the RTCPeerConnection
 * @param videoStream -
 *            {Object} MediaStream to be used as primary source (typically video
 *            and audio, or only video if combined with audioStream) for
 *            localVideo and to be added as stream to the RTCPeerConnection
 * @param audioStream -
 *            {Object} MediaStream to be used as second source (typically for
 *            audio) for localVideo and to be added as stream to the
 *            RTCPeerConnection
 *
 * @return {module:kurentoUtils.WebRtcPeer}
 */
WebRtcPeer.start = function(mode, localVideo, remoteVideo, onsdpoffer, onerror,
    mediaConstraints, videoStream, audioStream, configuration,
    connectionConstraints, callback)
{
  var options =
  {
    localVideo      : localVideo,
    remoteVideo     : remoteVideo,
    onsdpoffer      : onsdpoffer,
    onerror         : onerror,
    mediaConstraints: mediaConstraints,
    videoStream     : videoStream,
    audioStream     : audioStream,
    configuration   : configuration,

    connectionConstraints: connectionConstraints
  };

  return new WebRtcPeer(mode, options, callback);
};

/**
 * @description This methods creates a WebRtcPeer to receive video.
 *
 * @function module:kurentoUtils.WebRtcPeer.startRecvOnly
 *
 * @param remoteVideo -
 *            {Object} Video tag for the remote stream
 * @param onSdp -
 *            {Function} Callback executed when a SDP offer has been generated
 * @param onerror -
 *            {Function} Callback executed when an error happens generating an
 *            SDP offer
 * @param mediaConstraints -
 *            {Object[]} Constraints used to create RTCPeerConnection
 *
 * @return {module:kurentoUtils.WebRtcPeer}
 */
WebRtcPeer.startRecvOnly = function(remoteVideo, onSdp, onError,
  mediaConstraints, configuration, connectionConstraints, callback)
{
  return WebRtcPeer.start('recvonly', null, remoteVideo, onSdp, onError,
      mediaConstraints, null, null, configuration, connectionConstraints,
      callback);
};

/**
 * @description This methods creates a WebRtcPeer to send video.
 *
 * @function module:kurentoUtils.WebRtcPeer.startSendOnly
 *
 * @param localVideo -
 *            {Object} Video tag for the local stream
 * @param onSdp -
 *            {Function} Callback executed when a SDP offer has been generated
 * @param onerror -
 *            {Function} Callback executed when an error happens generating an
 *            SDP offer
 * @param mediaConstraints -
 *            {Object[]} Constraints used to create RTCPeerConnection
 *
 * @return {module:kurentoUtils.WebRtcPeer}
 */
WebRtcPeer.startSendOnly = function(localVideo, onSdp, onError,
  mediaConstraints, configuration, connectionConstraints, callback)
{
  return WebRtcPeer.start('sendonly', localVideo, null, onSdp, onError,
      mediaConstraints, null, null, configuration, connectionConstraints,
      callback);
};

/**
 * @description This methods creates a WebRtcPeer to send and receive video.
 *
 * @function module:kurentoUtils.WebRtcPeer.startSendRecv
 *
 * @param localVideo -
 *            {Object} Video tag for the local stream
 * @param remoteVideo -
 *            {Object} Video tag for the remote stream
 * @param onSdp -
 *            {Function} Callback executed when a SDP offer has been generated
 * @param onerror -
 *            {Function} Callback executed when an error happens generating an
 *            SDP offer
 * @param mediaConstraints -
 *            {Object[]} Constraints used to create RTCPeerConnection
 *
 * @return {module:kurentoUtils.WebRtcPeer}
 */
WebRtcPeer.startSendRecv = function(localVideo, remoteVideo, onSdp, onError,
  mediaConstraints, configuration, connectionConstraints, callback)
{
  return WebRtcPeer.start('sendrecv', localVideo, remoteVideo, onSdp,
      onError, mediaConstraints, null, null, configuration,
      connectionConstraints, callback);
};


//
// Specialized child classes
//

function WebRtcPeerRecvonly(options, callback)
{
  WebRtcPeerRecvonly.super_.call(this, 'recvonly', options, callback)
}
inherits(WebRtcPeerRecvonly, WebRtcPeer)

function WebRtcPeerSendonly(options, callback)
{
  WebRtcPeerSendonly.super_.call(this, 'sendonly', options,callback)
}
inherits(WebRtcPeerSendonly, WebRtcPeer)

function WebRtcPeerSendrecv(options, callback)
{
  WebRtcPeerSendrecv.super_.call(this, 'sendrecv', options, callback)
}
inherits(WebRtcPeerSendrecv, WebRtcPeer)


module.exports = WebRtcPeer;

WebRtcPeer.WebRtcPeer         = WebRtcPeer;
WebRtcPeer.WebRtcPeerRecvonly = WebRtcPeerRecvonly;
WebRtcPeer.WebRtcPeerSendonly = WebRtcPeerSendonly;
WebRtcPeer.WebRtcPeerSendrecv = WebRtcPeerSendrecv;

},{"events":7,"freeice":3,"inherits":8,"merge":9}],2:[function(require,module,exports){
/*
 * (C) Copyright 2014 Kurento (http://kurento.org/)
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the GNU Lesser General Public License
 * (LGPL) version 2.1 which accompanies this distribution, and is available at
 * http://www.gnu.org/licenses/lgpl-2.1.html
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 */

/**
 * This module contains a set of reusable components that have been found useful
 * during the development of the WebRTC applications with Kurento.
 * 
 * @module kurentoUtils
 * 
 * @copyright 2014 Kurento (http://kurento.org/)
 * @license LGPL
 */

var WebRtcPeer = require('./WebRtcPeer');

exports.WebRtcPeer = WebRtcPeer;

},{"./WebRtcPeer":1}],3:[function(require,module,exports){
/* jshint node: true */
'use strict';

var normalice = require('normalice');

/**
  # freeice

  The `freeice` module is a simple way of getting random STUN or TURN server
  for your WebRTC application.  The list of servers (just STUN at this stage)
  were sourced from this [gist](https://gist.github.com/zziuni/3741933).

  ## Example Use

  The following demonstrates how you can use `freeice` with
  [rtc-quickconnect](https://github.com/rtc-io/rtc-quickconnect):

  <<< examples/quickconnect.js

  As the `freeice` module generates ice servers in a list compliant with the
  WebRTC spec you will be able to use it with raw `RTCPeerConnection`
  constructors and other WebRTC libraries.

  ## Hey, don't use my STUN/TURN server!

  If for some reason your free STUN or TURN server ends up in the
  list of servers ([stun](https://github.com/DamonOehlman/freeice/blob/master/stun.json) or
  [turn](https://github.com/DamonOehlman/freeice/blob/master/turn.json))
  that is used in this module, you can feel
  free to open an issue on this repository and those servers will be removed
  within 24 hours (or sooner).  This is the quickest and probably the most
  polite way to have something removed (and provides us some visibility
  if someone opens a pull request requesting that a server is added).

  ## Please add my server!

  If you have a server that you wish to add to the list, that's awesome! I'm
  sure I speak on behalf of a whole pile of WebRTC developers who say thanks.
  To get it into the list, feel free to either open a pull request or if you
  find that process a bit daunting then just create an issue requesting
  the addition of the server (make sure you provide all the details, and if
  you have a Terms of Service then including that in the PR/issue would be
  awesome).

  ## I know of a free server, can I add it?

  Sure, if you do your homework and make sure it is ok to use (I'm currently
  in the process of reviewing the terms of those STUN servers included from
  the original list).  If it's ok to go, then please see the previous entry
  for how to add it.

  ## Current List of Servers

  * current as at the time of last `README.md` file generation

  ### STUN

  <<< stun.json

  ### TURN

  <<< turn.json

**/

var freeice = module.exports = function(opts) {
  // if a list of servers has been provided, then use it instead of defaults
  var servers = {
    stun: (opts || {}).stun || require('./stun.json'),
    turn: (opts || {}).turn || require('./turn.json')
  };

  var stunCount = (opts || {}).stunCount || 2;
  var turnCount = (opts || {}).turnCount || 0;
  var selected;

  function getServers(type, count) {
    var out = [];
    var input = [].concat(servers[type]);
    var idx;

    while (input.length && out.length < count) {
      idx = (Math.random() * input.length) | 0;
      out = out.concat(input.splice(idx, 1));
    }

    return out.map(function(url) {
      return normalice(type + ':' + url);
    });
  }

  // add stun servers
  selected = [].concat(getServers('stun', stunCount));

  if (turnCount) {
    selected = selected.concat(getServers('turn', turnCount));
  }

  return selected;
};

},{"./stun.json":5,"./turn.json":6,"normalice":4}],4:[function(require,module,exports){
/**
  # normalice

  Normalize an ice server configuration object (or plain old string) into a format
  that is usable in all browsers supporting WebRTC.  Primarily this module is designed
  to help with the transition of the `url` attribute of the configuration object to
  the `urls` attribute.

  ## Example Usage

  <<< examples/simple.js

**/

var protocols = [
  'stun:',
  'turn:'
];

module.exports = function(input) {
  var url = (input || {}).url || input;
  var protocol;
  var parts;
  var output = {};

  // if we don't have a string url, then allow the input to passthrough
  if (typeof url != 'string' && (! (url instanceof String))) {
    return input;
  }

  // trim the url string, and convert to an array
  url = url.trim();

  // if the protocol is not known, then passthrough
  protocol = protocols[protocols.indexOf(url.slice(0, 5))];
  if (! protocol) {
    return input;
  }

  // now let's attack the remaining url parts
  url = url.slice(5);
  parts = url.split('@');

  output.username = input.username;
  output.credential = input.credential;
  // if we have an authentication part, then set the credentials
  if (parts.length > 1) {
    url = parts[1];
    parts = parts[0].split(':');

    // add the output credential and username
    output.username = parts[0];
    output.credential = (input || {}).credential || parts[1] || '';
  }

  output.url = protocol + url;
  output.urls = [ output.url ];

  return output;
};

},{}],5:[function(require,module,exports){
module.exports=[
  "stun.l.google.com:19302",
  "stun1.l.google.com:19302",
  "stun2.l.google.com:19302",
  "stun3.l.google.com:19302",
  "stun4.l.google.com:19302",
  "stun.ekiga.net",
  "stun.ideasip.com",
  "stun.rixtelecom.se",
  "stun.schlund.de",
  "stun.stunprotocol.org:3478",
  "stun.voiparound.com",
  "stun.voipbuster.com",
  "stun.voipstunt.com",
  "stun.voxgratia.org",
  "stun.services.mozilla.com"
]

},{}],6:[function(require,module,exports){
module.exports=[]

},{}],7:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],8:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],9:[function(require,module,exports){
/*!
 * @name JavaScript/NodeJS Merge v1.2.0
 * @author yeikos
 * @repository https://github.com/yeikos/js.merge

 * Copyright 2014 yeikos - MIT license
 * https://raw.github.com/yeikos/js.merge/master/LICENSE
 */

;(function(isNode) {

	/**
	 * Merge one or more objects 
	 * @param bool? clone
	 * @param mixed,... arguments
	 * @return object
	 */

	var Public = function(clone) {

		return merge(clone === true, false, arguments);

	}, publicName = 'merge';

	/**
	 * Merge two or more objects recursively 
	 * @param bool? clone
	 * @param mixed,... arguments
	 * @return object
	 */

	Public.recursive = function(clone) {

		return merge(clone === true, true, arguments);

	};

	/**
	 * Clone the input removing any reference
	 * @param mixed input
	 * @return mixed
	 */

	Public.clone = function(input) {

		var output = input,
			type = typeOf(input),
			index, size;

		if (type === 'array') {

			output = [];
			size = input.length;

			for (index=0;index<size;++index)

				output[index] = Public.clone(input[index]);

		} else if (type === 'object') {

			output = {};

			for (index in input)

				output[index] = Public.clone(input[index]);

		}

		return output;

	};

	/**
	 * Merge two objects recursively
	 * @param mixed input
	 * @param mixed extend
	 * @return mixed
	 */

	function merge_recursive(base, extend) {

		if (typeOf(base) !== 'object')

			return extend;

		for (var key in extend) {

			if (typeOf(base[key]) === 'object' && typeOf(extend[key]) === 'object') {

				base[key] = merge_recursive(base[key], extend[key]);

			} else {

				base[key] = extend[key];

			}

		}

		return base;

	}

	/**
	 * Merge two or more objects
	 * @param bool clone
	 * @param bool recursive
	 * @param array argv
	 * @return object
	 */

	function merge(clone, recursive, argv) {

		var result = argv[0],
			size = argv.length;

		if (clone || typeOf(result) !== 'object')

			result = {};

		for (var index=0;index<size;++index) {

			var item = argv[index],

				type = typeOf(item);

			if (type !== 'object') continue;

			for (var key in item) {

				var sitem = clone ? Public.clone(item[key]) : item[key];

				if (recursive) {

					result[key] = merge_recursive(result[key], sitem);

				} else {

					result[key] = sitem;

				}

			}

		}

		return result;

	}

	/**
	 * Get type of variable
	 * @param mixed input
	 * @return string
	 *
	 * @see http://jsperf.com/typeofvar
	 */

	function typeOf(input) {

		return ({}).toString.call(input).slice(8, -1).toLowerCase();

	}

	if (isNode) {

		module.exports = Public;

	} else {

		window[publicName] = Public;

	}

})(typeof module === 'object' && module && typeof module.exports === 'object' && module.exports);
},{}]},{},[2])(2)
});