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

export function applySdpCodecPreferences(sdp) {
  if (!sdp) return sdp;
  let result = sdp;

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

export async function applyScreenSenderProfile(sender, profile) {
  if (!sender || !profile) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0].maxBitrate = profile.bitrate;
    params.encodings[0].maxFramerate = profile.frameRate;
    const source = sender.track?.getSettings?.();
    if (source?.width && source?.height) {
      params.encodings[0].scaleResolutionDownBy = Math.max(
        1,
        source.width / profile.width,
        source.height / profile.height
      );
    }
    params.degradationPreference = 'balanced';
    await sender.setParameters(params);
  } catch (err) {
    console.warn('Falha ao aplicar o perfil de qualidade da transmissão:', err);
  }
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

      // Video bitrate and resolution are controlled through RTCRtpSender parameters.
      offer.sdp = applySdpCodecPreferences(offer.sdp);

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
          applyScreenSenderProfile(sender, profile);
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
        answer.sdp = applySdpCodecPreferences(answer.sdp);
        
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
