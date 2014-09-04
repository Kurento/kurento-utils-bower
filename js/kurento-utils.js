!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.kurentoUtils=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
function defaultOnerror(error) {
	if(error) console.error(error);
}

function noop(){};


function WebRtcPeer(mode, localVideo, remoteVideo, onsdpoffer, onerror, videoStream) {

	Object.defineProperty(this, 'pc', { writable: true});

	this.localVideo = localVideo;
	this.remoteVideo = remoteVideo;
	this.onerror = onerror || defaultOnerror;
	this.stream = videoStream;
	this.mode = mode;
	this.onsdpoffer = onsdpoffer || noop;
}

WebRtcPeer.prototype.start = function() {

	var self = this;

	if (!this.pc) {
		this.pc = new RTCPeerConnection(this.server, this.options);
	}

	var pc = this.pc;

	if (this.stream && this.localVideo) {
		this.localVideo.src = URL.createObjectURL(this.stream);
		this.localVideo.muted = true;
	}

	if (this.stream) {
		pc.addStream(this.stream);
	}

	this.constraints =  {
			mandatory: {
				OfferToReceiveAudio: (this.remoteVideo !== undefined),
				OfferToReceiveVideo: (this.remoteVideo !== undefined)
			}
	};

	pc.createOffer(function(offer) {
		console.log('Created SDP offer');
		pc.setLocalDescription(offer, function() {
			console.log('Local description set');
		}, self.onerror);

	}, this.onerror, this.constraints);

	pc.onicecandidate = function (e) {
		// candidate exists in e.candidate
		if (e.candidate) return;

		var offerSdp = pc.localDescription.sdp;
		console.log('ICE negotiation completed');

		self.onsdpoffer(offerSdp, self);
//		self.emit('sdpoffer', offerSdp);
	};

}

WebRtcPeer.prototype.dispose = function() {
	console.log('Disposing WebRtcPeer');

	//FIXME This is not yet implemented in firefox
	//if (this.stream) this.pc.removeStream(this.stream);
	this.pc.close();

	if(this.localVideo) this.localVideo.src = '';
	if(this.remoteVideo) this.remoteVideo.src = '';

	if(this.stream)
	{
		this.stream.getAudioTracks().forEach(function(track)
		{
			track.stop()
		})
		this.stream.getVideoTracks().forEach(function(track)
		{
			track.stop()
		})
	}
};

WebRtcPeer.prototype.userMediaConstraints = {
		audio : true,
		video : {
			mandatory: {
				maxWidth: 640,
				maxFrameRate : 15,
				minFrameRate: 15
			}
		}
};

WebRtcPeer.prototype.processSdpAnswer = function(sdpAnswer) {
	var answer = new RTCSessionDescription({
		type : 'answer',
		sdp : sdpAnswer,
	});

	console.log('SDP answer received, setting remote description');
	var self = this;
	self.pc.setRemoteDescription(answer, function() {
		if (self.remoteVideo) {
			var stream = self.pc.getRemoteStreams()[0];
			self.remoteVideo.src = URL.createObjectURL(stream);
		}
	}, this.onerror);
}

WebRtcPeer.prototype.server = {
		iceServers : [ {
			url : 'stun:stun.l.google.com:19302'
		} ]
};

WebRtcPeer.prototype.options = {
		optional : [ {
			DtlsSrtpKeyAgreement : true
		} ]
};

WebRtcPeer.start = function(mode, localVideo, remoteVideo, onSdp, onerror, mediaConstraints, videoStream) {
	var wp = new WebRtcPeer(mode, localVideo, remoteVideo, onSdp, onerror, videoStream);

	if (wp.mode !== 'recv' && !wp.stream) {
		var constraints = mediaConstraints ?
				mediaConstraints : wp.userMediaConstraints;

		getUserMedia(constraints, function(userStream) {
			wp.stream = userStream;
			wp.start();
		}, wp.onerror);
	} else {
		wp.start();
	}

	return wp;
};

WebRtcPeer.startRecvOnly = function (remoteVideo, onSdp, onError, mediaConstraints) {
	return WebRtcPeer.start('recv', null, remoteVideo, onSdp, onError, mediaConstraints);
};

WebRtcPeer.startSendOnly = function (localVideo, onSdp, onError, mediaConstraints) {
	return WebRtcPeer.start('send', localVideo, null, onSdp, onError, mediaConstraints);
};

WebRtcPeer.startSendRecv = function (localVideo, remoteVideo, onSdp, onError, mediaConstraints) {
	return WebRtcPeer.start('sendRecv', localVideo, remoteVideo, onSdp, onError, mediaConstraints);
};

module.exports = WebRtcPeer;

},{}],2:[function(_dereq_,module,exports){
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
 * @module kurentoUtils
 *
 * @copyright 2013 Kurento (http://kurento.org/)
 * @license LGPL
 */

var WebRtcPeer = _dereq_('./WebRtcPeer');

exports.WebRtcPeer = WebRtcPeer;

},{"./WebRtcPeer":1}]},{},[2])
(2)
});