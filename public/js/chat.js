import { state } from './state.js';
import { encryptMessage, decryptMessage } from './crypto.js';

const activeTypingUsers = new Map(); // userId -> username
let typingTimeout = null;
let isCurrentlyTyping = false;
let pendingImageDataUrl = null;

// Helper: Escape HTML to avoid XSS
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper: Format URLs into clickable links safely
function formatMessageWithLinks(rawText) {
  const escaped = escapeHtml(rawText);
  const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
  return escaped.replace(urlRegex, (url) => {
    const href = url.startsWith('http') ? url : `https://${url}`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-faketz-accent hover:underline font-medium break-all inline-flex items-center gap-1">${url} <svg class="w-3 h-3 inline opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg></a>`;
  });
}

// Compress image on client via canvas before staging/sending
function compressImage(file, maxWidth = 1280, maxHeight = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Lightbox modal opener
export function openImageLightbox(src) {
  const modal = document.getElementById('image-lightbox-modal');
  const img = document.getElementById('image-lightbox-img');
  if (!modal || !img) return;

  img.src = src;
  modal.classList.remove('hidden-section');
}

export function closeImageLightbox() {
  const modal = document.getElementById('image-lightbox-modal');
  const img = document.getElementById('image-lightbox-img');
  if (!modal) return;

  modal.classList.add('hidden-section');
  if (img) img.src = '';
}

export function addMessage(user, content, type = 'text') {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;

  const div = document.createElement('div');
  div.className = 'bg-faketz-tertiary p-3 rounded-xl text-sm break-words border border-white/5 shadow-sm';

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let bodyHtml = '';
  if (type === 'image') {
    bodyHtml = `
      <div class="mt-1 relative group">
        <img src="${content}" alt="Imagem compartilhada" class="chat-clickable-image rounded-lg max-h-60 max-w-full object-contain cursor-pointer border border-white/10 hover:opacity-95 transition-opacity">
        <span class="text-[10px] text-zinc-500 mt-1 block">Clique para ampliar</span>
      </div>
    `;
  } else {
    bodyHtml = `<p class="text-zinc-300 leading-relaxed">${formatMessageWithLinks(content)}</p>`;
  }

  div.innerHTML = `
    <div class="flex items-baseline gap-2 mb-1">
      <strong class="text-white font-semibold">${escapeHtml(user)}</strong>
      <span class="text-[10.5px] text-zinc-500 font-medium">${time}</span>
    </div>
    ${bodyHtml}
  `;

  if (type === 'image') {
    const imgEl = div.querySelector('.chat-clickable-image');
    if (imgEl) {
      imgEl.addEventListener('click', (e) => {
        e.stopPropagation();
        openImageLightbox(content);
      });
    }
  }

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

export async function onChatMessage(data) {
  const decrypted = await decryptMessage(data.message, state.chatCryptoKey);
  try {
    const parsed = JSON.parse(decrypted);
    if (parsed && parsed.type === 'image') {
      addMessage(data.username, parsed.data, 'image');
      return;
    }
  } catch (_) {
    // Regular plain text
  }
  addMessage(data.username, decrypted, 'text');
}

export function onTypingStatus(data) {
  const { userId, username, isTyping } = data;
  if (!userId) return;

  if (isTyping) {
    activeTypingUsers.set(userId, username || 'Alguém');
  } else {
    activeTypingUsers.delete(userId);
  }

  updateTypingIndicator();
}

function updateTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  const textEl = document.getElementById('typing-text');
  if (!indicator || !textEl) return;

  const count = activeTypingUsers.size;
  if (count === 0) {
    indicator.classList.add('hidden');
    textEl.textContent = '';
    return;
  }

  indicator.classList.remove('hidden');
  const names = Array.from(activeTypingUsers.values());

  if (count === 1) {
    textEl.textContent = `${names[0]} está digitando...`;
  } else if (count === 2) {
    textEl.textContent = `${names[0]} e ${names[1]} estão digitando...`;
  } else {
    textEl.textContent = `${names[0]} e mais ${count - 1} pessoas estão digitando...`;
  }
}

function setLocalTyping(typing) {
  if (isCurrentlyTyping !== typing) {
    isCurrentlyTyping = typing;
    if (state.socket) {
      state.socket.emit('typing-status', typing);
    }
  }
}

function setStagedImage(dataUrl) {
  pendingImageDataUrl = dataUrl;
  const bar = document.getElementById('chat-image-preview-bar');
  const img = document.getElementById('chat-preview-img');
  const chatInput = document.getElementById('chat-input');

  if (bar && img) {
    if (dataUrl) {
      img.src = dataUrl;
      bar.classList.remove('hidden');
      chatInput?.focus();
    } else {
      img.src = '';
      bar.classList.add('hidden');
    }
  }
}

function clearStagedImage() {
  setStagedImage(null);
}

export function initChat() {
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatAttachBtn = document.getElementById('chat-attach-btn');
  const chatImageInput = document.getElementById('chat-image-input');
  const chatPreviewRemoveBtn = document.getElementById('chat-preview-remove-btn');
  const lightboxModal = document.getElementById('image-lightbox-modal');
  const lightboxCloseBtn = document.getElementById('image-lightbox-close');

  if (!chatForm || !chatInput) return;

  // Setup Lightbox Modal events
  if (lightboxModal) {
    lightboxModal.addEventListener('click', closeImageLightbox);
  }
  if (lightboxCloseBtn) {
    lightboxCloseBtn.addEventListener('click', closeImageLightbox);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeImageLightbox();
    }
  });

  // Remove staged preview button
  if (chatPreviewRemoveBtn) {
    chatPreviewRemoveBtn.addEventListener('click', clearStagedImage);
  }

  // Typing event listener
  chatInput.addEventListener('input', () => {
    const hasText = chatInput.value.trim().length > 0;
    if (hasText) {
      setLocalTyping(true);

      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        setLocalTyping(false);
      }, 2500);
    } else {
      setLocalTyping(false);
      if (typingTimeout) clearTimeout(typingTimeout);
    }
  });

  // Handle Ctrl+V / Paste image directly into preview bar
  chatInput.addEventListener('paste', async (e) => {
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          try {
            const dataUrl = await compressImage(file);
            setStagedImage(dataUrl);
          } catch (err) {
            console.error('Erro ao processar imagem colada:', err);
          }
        }
        break;
      }
    }
  });

  // File attach button trigger
  if (chatAttachBtn && chatImageInput) {
    chatAttachBtn.addEventListener('click', () => {
      chatImageInput.click();
    });

    chatImageInput.addEventListener('change', async () => {
      const file = chatImageInput.files?.[0];
      if (file) {
        try {
          const dataUrl = await compressImage(file);
          setStagedImage(dataUrl);
        } catch (err) {
          console.error('Erro ao processar anexo de imagem:', err);
        } finally {
          chatImageInput.value = '';
        }
      }
    });
  }

  // Form submit
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    const imageToSend = pendingImageDataUrl;

    if (typingTimeout) clearTimeout(typingTimeout);
    setLocalTyping(false);

    // If an image is staged, send it first
    if (imageToSend) {
      addMessage('Você', imageToSend, 'image');

      const payload = JSON.stringify({ type: 'image', data: imageToSend });
      const encrypted = await encryptMessage(payload, state.chatCryptoKey);

      if (state.socket) {
        state.socket.emit('chat-message', encrypted);
      }

      clearStagedImage();
    }

    // If text message accompanied, send it
    if (msg) {
      addMessage('Você', msg, 'text');

      const encryptedMsg = await encryptMessage(msg, state.chatCryptoKey);
      if (state.socket) {
        state.socket.emit('chat-message', encryptedMsg);
      }

      chatInput.value = '';
    }
  });
}
