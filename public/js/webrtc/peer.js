import { state } from '../state.js';
import { ICE_SERVERS, getProfile } from '../config.js';
import { addRemoteMedia, updateMediaVisibility } from '../ui/mediaRenderer.js';
import { getAudioContext } from '../ui/speaking.js';

export function configureFastCodecs(videoTransceiver) {
  if (!videoTransceiver || typeof RTCRtpReceiver === 'undefined' || !RTCRtpReceiver.getCapabilities) return;
  try {
    const capabilities = RTCRtpReceiver.getCapabilities('video');
    if (capabilities && capabilities.codecs) {
      // Prioritize hardware GPU gaming codecs (H.264 hardware on AMD AMF/Nvidia NVENC/Intel QSV)
      const preferred = ['video/h264', 'video/vp9', 'video/vp8', 'video/av01'];
      const prioritized = capabilities.codecs.filter((c) =>
        preferred.includes(c.mimeType.toLowerCase())
      );
      prioritized.sort((a, b) => {
        const idxA = preferred.indexOf(a.mimeType.toLowerCase());
        const idxB = preferred.indexOf(b.mimeType.toLowerCase());
        return idxA - idxB;
      });
      const others = capabilities.codecs.filter((c) =>
        !preferred.includes(c.mimeType.toLowerCase())
      );
      if (prioritized.length > 0) {
        videoTransceiver.setCodecPreferences([...prioritized, ...others]);
      }
    }
  } catch (e) {
    console.warn('Falha ao configurar preferências de codecs de alta velocidade', e);
  }
}

export function applyBitrateToSdp(sdp, profile) {
  if (!sdp) return sdp;
  let result = sdp;

  if (profile) {
    const kbps = Math.floor(profile.bitrate / 1000);
    const bps = profile.bitrate;
    const minKbps = profile.minBitrateKbps || Math.floor(kbps * 0.5);
    const startKbps = profile.startBitrateKbps || Math.floor(kbps * 0.75);

    if (result.includes('b=AS:')) {
      result = result.replace(/b=AS:\d+/g, "b=AS:" + kbps);
    } else if (result.includes('c=IN')) {
      result = result.replace(/(c=IN[^\r\n]*(?:\r?\n))/g, (match, line) => line + 'b=AS:' + kbps + '\r\n');
    } else {
      result = result.replace(/(m=video[^\r\n]*(?:\r?\n))/g, (match, line) => line + 'b=AS:' + kbps + '\r\n');
    }

    if (result.includes('b=TIAS:')) {
      result = result.replace(/b=TIAS:\d+/g, 'b=TIAS:' + bps);
    } else {
      result = result.replace(/(b=AS:\d+[^\r\n]*(?:\r?\n))/g, (match, line) => line + 'b=TIAS:' + bps + '\r\n');
    }

    const googleBwe = 'x-google-min-bitrate=' + minKbps + ';x-google-start-bitrate=' + startKbps + ';x-google-max-bitrate=' + kbps;

    const videoMatch = result.match(/m=video\s+\d+\s+[\w/]+\s+([\d\s]+)/);
    const videoPayloads = videoMatch ? videoMatch[1].trim().split(/\s+/) : [];

    result = result.replace(/(a=fmtp:\d+)(?!.*apt=)(.*)(\r?\n)/g, (match, prefix, rest, eol) => {
      if (rest.includes('x-google-min-bitrate')) return match;
      const trimmed = rest.trim();
      const separator = (trimmed === '' || trimmed.endsWith(';')) ? '' : ';';
      return prefix + rest + separator + googleBwe + eol;
    });

    videoPayloads.forEach((pt) => {
      const fmtpRegex = new RegExp('a=fmtp:' + pt + '\\b');
      const rtpmapRegex = new RegExp('(a=rtpmap:' + pt + '\\s+[^\r\n]+(?:\r?\n))');
      if (!fmtpRegex.test(result) && rtpmapRegex.test(result)) {
        result = result.replace(rtpmapRegex, '$1a=fmtp:' + pt + ' ' + googleBwe + '\r\n');
      }
    });
  }

  const opusRegex = /a=rtpmap:(\d+) opus\/48000\/2/i;
  const opusMatch = result.match(opusRegex);
  if (opusMatch) {
    const opusPt = opusMatch[1];
    const fmtpRegex = new RegExp('a=fmtp:' + opusPt + ' (.*)', 'g');
    if (result.match(fmtpRegex)) {
      result = result.replace(fmtpRegex, 'a=fmtp:' + opusPt + ' $1; stereo=1; sprop-stereo=1; maxaveragebitrate=128000; useinbandfec=1');
    } else {
      result = result.replace(opusRegex, 'a=rtpmap:' + opusPt + ' opus/48000/2\r\na=fmtp:' + opusPt + ' stereo=1; sprop-stereo=1; maxaveragebitrate=128000; useinbandfec=1');
    }
  }

  return result;
}

export function createPeerConnection(userId, peerUsername, isMuted = false, peerAvatar = null) {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  const isPolite = state.socket.id > userId;

  const peerObj = {
    pc,
    isPolite,
    makingOffer: false,
    ignoreOffer: false,
    username: peerUsername,
    isMuted,
    analyser: null
  };
  state.peers[userId] = peerObj;

  // Immediately render avatar tile so spectators and voice users appear in grid
  addRemoteMedia(userId, null, peerUsername, isMuted, peerAvatar);

  pc.onnegotiationneeded = async () => {
    try {
      peerObj.makingOffer = true;
      let offer = await pc.createOffer();

      // SDP Munging to guarantee high bitrate and instant crisp quality
      const profile = state.screenStream ? getProfile(state.selectedQuality) : null;
      offer.sdp = applyBitrateToSdp(offer.sdp, profile);

      await pc.setLocalDescription(offer);
      state.socket.emit('signal', { to: userId, signal: pc.localDescription });
    } catch (err) {
      console.error('Erro na negociação WebRTC:', err);
    } finally {
      peerObj.makingOffer = false;
    }
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      state.socket.emit('signal', { to: userId, signal: candidate });
    }
  };

  pc.ontrack = ({ track, streams }) => {

    const stream = streams[0];
    if (stream) {
      const isScreenShare = stream.getVideoTracks().length > 0;
      const mediaId = isScreenShare ? `${userId}-screen` : userId;
      addRemoteMedia(mediaId, stream, peerObj.username, peerObj.isMuted);

      // Audio frequency analyser for "speaking" green ring animation
      if (track.kind === 'audio') {
        const audioContext = getAudioContext();
        if (audioContext) {
          try {
            if (audioContext.state === 'suspended') {
              audioContext.resume();
            }
            const audioSrc = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            audioSrc.connect(analyser);
            peerObj.analyser = analyser;
          } catch (e) {
            console.warn('Não foi possível inicializar analyser de áudio', e);
          }
        }
      }

      const updateVisibility = () => updateMediaVisibility(mediaId, stream);
      stream.addEventListener('addtrack', updateVisibility);
      stream.addEventListener('removetrack', updateVisibility);
    }
  };

  // Add local microphone if present
  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => pc.addTrack(track, state.localStream));
  }

  // Add active screen share if currently streaming
  if (state.screenStream) {
    state.screenStream.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, state.screenStream);
      if (track.kind === 'video') {
        try {
          const profile = getProfile(state.selectedQuality);
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = profile.bitrate;
          if (profile.frameRate < 60) {
            params.encodings[0].maxFramerate = profile.frameRate;
          } else {
            delete params.encodings[0].maxFramerate;
          }
          params.degradationPreference = 'maintain-framerate';
          sender.setParameters(params).catch((e) => console.warn(e));
        } catch (e) {
          console.warn('Falha ao configurar bitrate para novo participante', e);
        }

        // Prioritize modern multi-core GPU gaming codecs (VP9, AV1, VP8)
        try {
          const transceivers = pc.getTransceivers();
          const videoTransceiver = transceivers.find((t) => t.sender === sender);
          if (videoTransceiver) {
            configureFastCodecs(videoTransceiver);
          }
        } catch (e) {
          console.warn('Falha ao configurar preferências de codecs de alta velocidade', e);
        }
      }
    });
  }

  return peerObj;
}

export async function handleSignal({ from, signal, username: signalUsername, avatar: signalAvatar, isMuted: signalIsMuted }) {
  let peerObj = state.peers[from];
  if (!peerObj) {
    peerObj = createPeerConnection(from, signalUsername, signalIsMuted, signalAvatar);
  }

  const { pc, isPolite } = peerObj;
  peerObj.isMuted = signalIsMuted;

  try {
    if (signal.type === 'offer' || signal.type === 'answer') {
      const offerCollision = signal.type === 'offer' && (peerObj.makingOffer || pc.signalingState !== 'stable');
      peerObj.ignoreOffer = !isPolite && offerCollision;
      if (peerObj.ignoreOffer) return;

      await pc.setRemoteDescription(new RTCSessionDescription(signal));

      if (signal.type === 'offer') {
        let answer = await pc.createAnswer();
        const profile = state.screenStream ? getProfile(state.selectedQuality) : null;
        answer.sdp = applyBitrateToSdp(answer.sdp, profile);
        
        await pc.setLocalDescription(answer);
        state.socket.emit('signal', { to: from, signal: pc.localDescription });
      }
    } else if (signal.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal));
      } catch (err) {
        if (!peerObj.ignoreOffer) {
          console.error('ICE candidate error', err);
        }
      }
    }
  } catch (err) {
    console.error('Erro ao processar sinal WebRTC:', err);
  }
}
