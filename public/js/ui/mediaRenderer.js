// Media Rendering Logic (Video Grid tiles, Avatar bubbles, Volume controls, Theatre mode)

export function addRemoteMedia(mediaId, stream, peerUsername, isMutedInitially = false, avatar = null) {
  const videoGrid = document.getElementById('video-grid');
  if (!videoGrid) return;

  let containerEl = document.getElementById(`media-${mediaId}`);
  const hasVideo = stream ? stream.getVideoTracks().length > 0 : false;

  if (!containerEl) {
    containerEl = document.createElement('div');
    containerEl.id = `media-${mediaId}`;
    containerEl.className = 'media-container group relative bg-faketz-secondary rounded-2xl overflow-hidden flex items-center justify-center cursor-pointer transition-all duration-300 ring-2 ring-transparent shadow-xl shrink-0 border border-white/5';
    containerEl.style.flex = '1 1 200px';
    containerEl.style.maxWidth = '100%';
    containerEl.style.aspectRatio = '16/9';

    // Focus / Theatre Mode click handler
    containerEl.addEventListener('click', () => {
      const isFocused = containerEl.classList.contains('focused');
      document.querySelectorAll('.media-container.focused').forEach(el => {
        el.classList.remove('focused');
        el.style.flex = '1 1 200px';
        el.style.maxWidth = '100%';
        el.style.height = 'auto';
        el.classList.add('rounded-2xl');
      });

      if (!isFocused) {
        containerEl.classList.add('focused');
        containerEl.style.flex = '1 1 100%';
        containerEl.style.maxWidth = '100%';
        containerEl.style.height = '100%';
        containerEl.classList.remove('rounded-2xl');
        videoGrid.classList.add('p-0', 'gap-0');
        videoGrid.classList.remove('p-4', 'gap-4', 'content-start');
        videoGrid.classList.add('content-stretch', 'items-stretch');

        // Hide other tiles
        Array.from(videoGrid.children).forEach(child => {
          if (child !== containerEl) child.style.display = 'none';
        });
      } else {
        videoGrid.classList.remove('p-0', 'gap-0', 'content-stretch', 'items-stretch');
        videoGrid.classList.add('p-4', 'gap-4', 'content-start');
        Array.from(videoGrid.children).forEach(child => {
          child.style.display = 'flex';
        });
      }
    });

    const videoEl = document.createElement('video');
    videoEl.id = `video-${mediaId}`;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.className = 'w-full h-full object-contain bg-black';
    videoEl.style.transform = 'translateZ(0)';

    if (mediaId.startsWith('local-')) {
      videoEl.muted = true;
    }

    videoEl.style.display = hasVideo ? 'block' : 'none';

    const labelEl = document.createElement('div');
    labelEl.className = 'ui-fadeable transition-opacity duration-500 absolute bottom-3 left-3 bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-bold pointer-events-none z-10 shadow-sm border border-white/5';
    labelEl.innerText = hasVideo ? `${peerUsername} (Tela)` : peerUsername;

    const avatarEl = document.createElement('div');
    avatarEl.className = 'media-avatar-bubble absolute inset-0 m-auto w-24 h-24 rounded-full bg-gradient-to-br from-faketz-accent to-faketz-accentHover text-white text-3xl font-bold flex items-center justify-center z-0 shadow-2xl pointer-events-none border-4 border-faketz-main/50 overflow-hidden';

    if (avatar) {
      const avatarImage = document.createElement('img');
      avatarImage.src = /^data:image\/jpeg;base64,[a-z0-9+/]+=*$/i.test(avatar) ? avatar : '';
      avatarImage.alt = peerUsername || '';
      avatarImage.className = 'w-full h-full object-cover';
      avatarEl.appendChild(avatarImage);
    } else {
      avatarEl.innerText = (peerUsername || '?').charAt(0).toUpperCase();
    }
    avatarEl.style.display = hasVideo ? 'none' : 'flex';

    // Mute indicator for voice/spectator tiles
    const muteInd = document.createElement('div');
    muteInd.id = `mute-indicator-${mediaId}`;
    muteInd.className = 'absolute bottom-3 right-3 bg-faketz-red text-white w-8 h-8 rounded-full flex items-center justify-center z-10 shadow-lg border-2 border-faketz-secondary';
    muteInd.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path><line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line></svg>';
    muteInd.style.display = (!hasVideo && isMutedInitially) ? 'flex' : 'none';

    // Volume & Fullscreen controls (remote tiles only)
    if (!mediaId.startsWith('local-')) {
      const overlay = document.createElement('div');
      overlay.className = 'absolute top-3 right-3 bg-black/80 backdrop-blur-md px-3 py-2 rounded-xl flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 shadow-xl border border-white/10 translate-y-[-5px] group-hover:translate-y-0';
      overlay.addEventListener('click', e => e.stopPropagation());

      const volSlider = document.createElement('input');
      volSlider.type = 'range';
      volSlider.min = 0;
      volSlider.max = 1;
      volSlider.step = 0.01;
      volSlider.value = 1;
      volSlider.title = 'Volume';
      volSlider.className = 'w-16 accent-faketz-accent cursor-pointer';

      const muteBtn = document.createElement('button');
      muteBtn.className = 'text-white p-1.5 rounded-lg bg-faketz-red hover:bg-red-600 transition-colors shadow-sm';
      muteBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clip-rule="evenodd"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg>';

      const fsBtn = document.createElement('button');
      fsBtn.title = 'Tela Cheia';
      fsBtn.className = 'text-white p-1.5 rounded-lg bg-zinc-600 hover:bg-zinc-500 transition-colors shadow-sm';
      fsBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>';

      const pipBtn = document.createElement('button');
      pipBtn.title = 'Pop-up (Picture in Picture)';
      pipBtn.className = 'text-white p-1.5 rounded-lg bg-zinc-600 hover:bg-zinc-500 transition-colors shadow-sm';
      // PiP icon (two overlapping squares)
      pipBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-width="2"></rect><rect x="12" y="12" width="7" height="5" stroke-width="2"></rect></svg>';

      volSlider.addEventListener('input', (e) => {
        videoEl.volume = e.target.value;
        if (videoEl.volume == 0) {
          muteBtn.classList.remove('bg-zinc-600', 'hover:bg-zinc-500');
          muteBtn.classList.add('bg-faketz-red', 'hover:bg-red-600');
        } else if (videoEl.muted) {
          videoEl.muted = false;
          muteBtn.classList.add('bg-zinc-600', 'hover:bg-zinc-500');
          muteBtn.classList.remove('bg-faketz-red', 'hover:bg-red-600');
        }
      });

      muteBtn.addEventListener('click', () => {
        videoEl.muted = !videoEl.muted;
        if (videoEl.muted) {
          muteBtn.classList.remove('bg-zinc-600', 'hover:bg-zinc-500');
          muteBtn.classList.add('bg-faketz-red', 'hover:bg-red-600');
        } else {
          muteBtn.classList.add('bg-zinc-600', 'hover:bg-zinc-500');
          muteBtn.classList.remove('bg-faketz-red', 'hover:bg-red-600');
          if (volSlider.value == 0) {
            volSlider.value = 0.5;
            videoEl.volume = 0.5;
          }
        }
      });

      fsBtn.addEventListener('click', () => {
        if (videoEl.requestFullscreen) {
          videoEl.requestFullscreen();
        } else if (videoEl.webkitRequestFullscreen) {
          videoEl.webkitRequestFullscreen();
        }
      });

      pipBtn.addEventListener('click', () => {
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(console.error);
          return;
        }

        if (containerEl.pipWindow) {
          containerEl.pipWindow.close();
          return;
        }

        // O Electron ainda não possui suporte estável para a nova API Document PiP (ele quebra ao tentar criar a janela).
        // Portanto, limitamos o Super Pop-up apenas para quem estiver acessando pelo navegador Chrome.
        const canUseSuperPip = 'documentPictureInPicture' in window && !window.desktopApp?.isDesktop;

        if (canUseSuperPip) {
          const w = Math.max(400, videoEl.videoWidth || 800);
          const h = Math.max(300, videoEl.videoHeight || 450);
          
          window.documentPictureInPicture.requestWindow({ width: w, height: h })
            .then(pipWindow => {
              containerEl.pipWindow = pipWindow;
              pipWindow.document.body.style.margin = '0';
              pipWindow.document.body.style.backgroundColor = 'black';
              pipWindow.document.body.style.overflow = 'hidden';
              pipWindow.document.body.style.display = 'flex';
              pipWindow.document.body.style.alignItems = 'center';
              pipWindow.document.body.style.justifyContent = 'center';
              pipWindow.document.body.style.height = '100vh';
              
              pipWindow.document.body.appendChild(videoEl);
              
              pipWindow.addEventListener('pagehide', () => {
                containerEl.insertBefore(videoEl, containerEl.firstChild);
                containerEl.pipWindow = null;
              });
            })
            .catch(e => {
              console.warn('Super Pop-up falhou. O navegador web pode ter bloqueado.', e);
            });
        } else {
          // Fallback garantido: PiP tradicional (com limite de tamanho imposto pelo SO)
          if (videoEl.requestPictureInPicture) {
            videoEl.requestPictureInPicture().catch(console.error);
          }
        }
      });

      pipBtn.id = `pip-btn-${mediaId}`;
      fsBtn.id = `fs-btn-${mediaId}`;

      // Mostrar botão se tiver PiP ou Super PiP disponível
      if (document.pictureInPictureEnabled || 'documentPictureInPicture' in window) {
        overlay.appendChild(pipBtn);
      }
      overlay.appendChild(volSlider);
      overlay.appendChild(muteBtn);
      overlay.appendChild(fsBtn);
      containerEl.appendChild(overlay);
    }

    containerEl.appendChild(videoEl);
    containerEl.appendChild(avatarEl);
    containerEl.appendChild(labelEl);
    if (!hasVideo) containerEl.appendChild(muteInd);
    videoGrid.appendChild(containerEl);
  }

  // Update visibility of PiP and Fullscreen buttons dynamically
  const pipBtn = document.getElementById(`pip-btn-${mediaId}`);
  const fsBtn = document.getElementById(`fs-btn-${mediaId}`);
  if (pipBtn) pipBtn.style.display = hasVideo ? 'block' : 'none';
  if (fsBtn) fsBtn.style.display = hasVideo ? 'block' : 'none';

  const videoEl = document.getElementById(`video-${mediaId}`);
  if (videoEl) {
    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
      if (stream) {
        videoEl.play().catch(e => console.warn('Autoplay preventions:', e));
      }
    }
    videoEl.style.display = hasVideo ? 'block' : 'none';
  }

  const avatarEl = containerEl.querySelector('.w-24.h-24');
  if (avatarEl) {
    avatarEl.style.display = hasVideo ? 'none' : 'flex';
  }
}

export function updateMediaVisibility(mediaId, stream) {
  const videoGrid = document.getElementById('video-grid');
  const containerEl = document.getElementById(`media-${mediaId}`);
  if (containerEl && stream) {
    const hasAnyTrack = stream.getTracks().length > 0;
    if (!hasAnyTrack) {
      if (containerEl.pipWindow) {
        containerEl.pipWindow.close();
      }
      if (containerEl.classList.contains('focused') && videoGrid) {
        videoGrid.classList.remove('p-0', 'gap-0', 'content-stretch', 'items-stretch');
        videoGrid.classList.add('p-4', 'gap-4', 'content-start');
        Array.from(videoGrid.children).forEach(child => {
          child.style.display = 'flex';
        });
      }
      containerEl.remove();
    }
  }
}

export function removeVideo(userId) {
  const videoGrid = document.getElementById('video-grid');
  const elements = [
    document.getElementById(`media-${userId}`),
    document.getElementById(`media-${userId}-screen`)
  ];

  elements.forEach(el => {
    if (el) {
      if (el.pipWindow) {
        el.pipWindow.close();
      }
      if (el.classList.contains('focused') && videoGrid) {
        videoGrid.classList.remove('p-0', 'gap-0', 'content-stretch', 'items-stretch');
        videoGrid.classList.add('p-4', 'gap-4', 'content-start');
        Array.from(videoGrid.children).forEach(child => {
          child.style.display = 'flex';
        });
      }
      el.remove();
    }
  });
}
