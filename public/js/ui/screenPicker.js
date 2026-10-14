import { state } from '../state.js';
import { getProfile } from '../config.js';
import { applyScreenQuality, startScreenSharing } from '../webrtc/media.js';

let currentSources = [];
let selectedSourceId = null;
let currentTab = 'screens'; // 'screens' | 'windows'

export function initScreenPicker() {
  const modal = document.getElementById('screen-picker-modal');
  const closeBtn = document.getElementById('screen-picker-close-btn');
  const cancelBtn = document.getElementById('screen-picker-cancel-btn');
  const confirmBtn = document.getElementById('screen-picker-confirm-btn');
  const tabScreens = document.getElementById('picker-tab-screens');
  const tabWindows = document.getElementById('picker-tab-windows');
  const grid = document.getElementById('screen-picker-grid');
  const qualityButtons = document.querySelectorAll('.quality-btn');
  const qualityBadge = document.getElementById('selected-quality-badge');

  if (!modal || !closeBtn || !cancelBtn || !confirmBtn) return;

  function updateQualityUI() {
    qualityButtons.forEach((btn) => {
      const q = btn.getAttribute('data-quality');
      if (q === state.selectedQuality) {
        btn.className =
          'quality-btn py-2 px-3 rounded-xl text-xs font-semibold border transition-all text-white bg-faketz-accent/20 border-faketz-accent shadow-sm text-center';
      } else {
        btn.className =
          'quality-btn py-2 px-3 rounded-xl text-xs font-semibold border transition-all text-zinc-400 border-zinc-700/60 hover:text-white hover:border-zinc-500 text-center';
      }
    });

    const profile = getProfile(state.selectedQuality);
    if (qualityBadge) qualityBadge.innerText = profile.label;

    const screenShareBtn = document.getElementById('screen-share-btn');
    if (screenShareBtn && !state.screenStream) {
      screenShareBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
        ${profile.label}
      `;
    }
  }

  qualityButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedQuality = btn.getAttribute('data-quality');
      updateQualityUI();

      // If already streaming, dynamically update bitrate and framerate on all peers
      if (state.screenStream) {
        const profile = getProfile(state.selectedQuality);
        applyScreenQuality(profile);
      }
    });
  });

  updateQualityUI();

  function closeModal(cancelled = true) {
    modal.classList.add('hidden-section');
    if (cancelled && window.desktopApp?.cancelSource) {
      window.desktopApp.cancelSource();
    }
  }

  function renderSources() {
    if (!grid) return;
    grid.innerHTML = '';

    const isDesktop = Boolean(window.desktopApp?.isDesktop);

    if (!isDesktop) {
      // In standard web browser, explain that the browser will open the permission picker
      grid.innerHTML = `
        <div class="col-span-2 py-8 px-4 text-center text-zinc-300 text-sm flex flex-col items-center justify-center gap-3">
          <div class="w-12 h-12 rounded-full bg-faketz-accent/10 flex items-center justify-center text-faketz-accent">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
          </div>
          <p class="font-semibold text-white">Escolha o Perfil de Qualidade</p>
          <p class="text-xs text-zinc-400 max-w-sm">
            Selecione a resolução e taxa de quadros desejada abaixo. Ao clicar em Compartilhar, a caixa de permissão do navegador se abrirá.
          </p>
        </div>
      `;
      confirmBtn.disabled = false;
      return;
    }

    const filtered = currentSources.filter((s) =>
      currentTab === 'screens' ? s.isScreen : !s.isScreen
    );

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-2 py-10 text-center text-zinc-400 text-sm">
          Nenhuma ${currentTab === 'screens' ? 'tela' : 'janela de jogo ou app'} encontrada.
        </div>
      `;
      confirmBtn.disabled = true;
      return;
    }

    if (!filtered.some((s) => s.id === selectedSourceId)) {
      selectedSourceId = filtered[0].id;
    }
    confirmBtn.disabled = false;

    filtered.forEach((source) => {
      const isSelected = source.id === selectedSourceId;
      const card = document.createElement('div');
      card.className = `cursor-pointer rounded-xl overflow-hidden border-2 transition-all p-2 flex flex-col gap-2 bg-faketz-main/60 hover:bg-faketz-main ${
        isSelected
          ? 'border-faketz-accent ring-2 ring-faketz-accent/50 shadow-lg shadow-faketz-accent/20'
          : 'border-transparent hover:border-zinc-700'
      }`;

      card.innerHTML = `
        <div class="w-full aspect-video bg-black/60 rounded-lg overflow-hidden flex items-center justify-center relative">
          <img src="${source.thumbnail}" alt="${source.name}" class="w-full h-full object-contain" />
        </div>
        <div class="flex items-center gap-2 px-1">
          ${
            source.appIcon
              ? `<img src="${source.appIcon}" class="w-4 h-4 shrink-0 rounded" />`
              : `<svg class="w-4 h-4 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>`
          }
          <span class="text-xs font-medium text-white truncate" title="${source.name}">${source.name}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        selectedSourceId = source.id;
        renderSources();
      });

      grid.appendChild(card);
    });
  }

  function setTab(tab) {
    currentTab = tab;
    if (tabScreens && tabWindows) {
      if (tab === 'screens') {
        tabScreens.className =
          'pb-3 text-sm font-semibold border-b-2 border-faketz-accent text-white transition-colors';
        tabWindows.className =
          'pb-3 text-sm font-semibold border-b-2 border-transparent text-zinc-400 hover:text-zinc-200 transition-colors';
      } else {
        tabWindows.className =
          'pb-3 text-sm font-semibold border-b-2 border-faketz-accent text-white transition-colors';
        tabScreens.className =
          'pb-3 text-sm font-semibold border-b-2 border-transparent text-zinc-400 hover:text-zinc-200 transition-colors';
      }
    }
    renderSources();
  }

  if (tabScreens) tabScreens.addEventListener('click', () => setTab('screens'));
  if (tabWindows) tabWindows.addEventListener('click', () => setTab('windows'));

  closeBtn.addEventListener('click', () => closeModal(true));
  cancelBtn.addEventListener('click', () => closeModal(true));

  confirmBtn.addEventListener('click', () => {
    const isDesktop = Boolean(window.desktopApp?.isDesktop);

    if (isDesktop) {
      if (selectedSourceId && window.desktopApp?.selectSource) {
        window.desktopApp.selectSource(selectedSourceId);
        closeModal(false);
      }
    } else {
      // In web, close modal and start browser screen share with selected quality
      closeModal(false);
      startScreenSharing();
    }
  });

  // Desktop Electron event
  if (window.desktopApp?.onOpenScreenPicker) {
    window.desktopApp.onOpenScreenPicker(async () => {
      try {
        if (tabScreens) tabScreens.style.display = '';
        if (tabWindows) tabWindows.style.display = '';
        currentSources = await window.desktopApp.getSources();
        modal.classList.remove('hidden-section');
        setTab('screens');
      } catch (e) {
        console.error('Erro ao abrir seletor de telas:', e);
        closeModal(true);
      }
    });
  }
}

export function openWebQualityModal() {
  const modal = document.getElementById('screen-picker-modal');
  const tabScreens = document.getElementById('picker-tab-screens');
  const tabWindows = document.getElementById('picker-tab-windows');
  const grid = document.getElementById('screen-picker-grid');

  if (!modal || !grid) return;

  if (tabScreens) tabScreens.style.display = 'none';
  if (tabWindows) tabWindows.style.display = 'none';

  grid.innerHTML = `
    <div class="col-span-2 py-8 px-4 text-center text-zinc-300 text-sm flex flex-col items-center justify-center gap-3">
      <div class="w-12 h-12 rounded-full bg-faketz-accent/10 flex items-center justify-center text-faketz-accent">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
      </div>
      <p class="font-semibold text-white">Escolha o Perfil de Qualidade</p>
      <p class="text-xs text-zinc-400 max-w-sm">
        Selecione a resolução e taxa de quadros desejada abaixo e clique em <strong>Compartilhar</strong>.
      </p>
    </div>
  `;

  modal.classList.remove('hidden-section');
}
