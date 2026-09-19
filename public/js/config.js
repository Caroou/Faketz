export const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Check if running inside the native Desktop Application
export const isDesktopApp = () =>
  typeof window !== 'undefined' && Boolean(window.desktopApp?.isDesktop);

// Quality profiles tuned for crisp clarity and smooth motion in fast-paced games
export const QUALITY_PROFILES = {
  '720p60': {
    id: '720p60',
    width: 1280,
    height: 720,
    frameRate: 60,
    bitrate: 6500000, // 6.5 Mbps
    startBitrateKbps: 5000,
    minBitrateKbps: 3500,
    label: '720p 60 FPS'
  },
  '1080p60': {
    id: '1080p60',
    width: 1920,
    height: 1080,
    frameRate: 60,
    bitrate: 10000000, // 10.0 Mbps
    startBitrateKbps: 7500,
    minBitrateKbps: 5000,
    label: '1080p 60 FPS'
  }
};

export const getProfile = (qualityId = '1080p60') =>
  QUALITY_PROFILES[qualityId] || QUALITY_PROFILES['1080p60'];

export const getScreenConstraints = (qualityId = '1080p60') => {
  const profile = getProfile(qualityId);
  return {
    video: {
      width: { ideal: profile.width },
      height: { ideal: profile.height },
      frameRate: { ideal: profile.frameRate, max: profile.frameRate }
    },
    audio: {
      echoCancellation: false, // Turned off to prevent game/media audio from ducking or getting muffled when someone speaks
      noiseSuppression: false,
      autoGainControl: false,
      suppressLocalAudioPlayback: true
    }
  };
};
