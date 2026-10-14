// Centralized state container for the Faketz application
// Centralized state container for the Faketz application
export const state = {
  socket: null,
  roomId: '',
  username: '',
  localStream: null,
  screenStream: null,
  isMicMuted: false,
  noiseSuppression: true,
  currentTab: 'join',
  chatCryptoKey: null,
  isConnecting: false,
  selectedQuality: '1080p60',
  avatar: null, // base64 string or null
  roomPin: '',
  peers: {} // userId -> { pc, isPolite, makingOffer, ignoreOffer, username, avatar, isMuted, analyser }
};
