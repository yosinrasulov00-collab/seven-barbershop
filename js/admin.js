(function () {
  'use strict';

  const TOKEN_KEY = 'seven_admin_token';
  let site = null;
  let saving = false;

  const $ = (id) => document.getElementById(id);

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  }

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    };
  }

  function toast(msg, isError) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-50 admin-toast px-5 py-3 rounded-xl text-sm shadow-xl max-w-[90vw] text-center border ${
      isError ? 'bg-red-950/90 border-red-500/50 text-red-200' : 'bg-dark-card border-gold/40 text-white'
    }`;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  function showApp(loggedIn) {
    $('login-screen').classList.toggle('hidden', loggedIn);
    $('admin-app').classList.toggle('hidden', !loggedIn);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setToken(null);
      showApp(false);
      throw new Error('Сессия истекла — войдите снова');
    }
    if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
    return data;
  }

  function bind(id, key, nested) {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (nested) {
        if (!site[nested]) site[nested] = {};
        site[nested][key] = el.value;
      } else {
        site[key] = el.type === 'number' ? parseFloat(el.value) || 0 : el.value;
      }
      if (id === 'brand-name') $('header-brand').textContent = el.value;
      if (id === 'hero-url') updateHeroPreview(el.value);
    });
  }

  function fillForm() {
    const b = site.brand || {};
    $('brand-name').value = b.name || '';
    $('brand-label').value = b.label || '';
    $('brand-tagline').value = b.tagline || '';
    $('brand-subtitle').value = b.subtitle || '';
    $('header-brand').textContent = b.name || '';

    $('services-title').value = site.servicesTitle || '';
    $('services-subtitle').value = site.servicesSubtitle || '';
    $('masters-title').value = site.mastersTitle || '';
    $('masters-subtitle').value = site.mastersSubtitle || '';
    $('price-note').value = site.priceNote || '';

    $('hero-url').value = site.heroImage || '';
    updateHeroPreview(site.heroImage);

    $('telegram-url').value = site.telegram || '';
    $('telegram-username').value = site.telegramUsername || '';
    $('hours').value = site.hours || '';
    $('order-confirm').value = site.orderConfirm || '';
    $('visit-time').value = site.visitTime || '';
    $('address').value = site.address || '';
    $('lat').value = site.lat ?? '';
    $('lng').value = site.lng ?? '';
    $('contacts-subtitle').value = site.contactsSubtitle || '';

    renderServices();
    renderMasters();
  }

  function updateHeroPreview(src) {
    const img = $('hero-preview');
    if (!img) return;
    if (src) {
      img.src = src + (src.startsWith('http') ? '' : `?t=${Date.now()}`);
      img.classList.remove('hidden');
    } else {
      img.removeAttribute('src');
    }
  }

  function collectFromForm() {
    site.brand = {
      name: $('brand-name').value.trim(),
      label: $('brand-label').value.trim(),
      tagline: $('brand-tagline').value.trim(),
      subtitle: $('brand-subtitle').value.trim(),
    };
    site.servicesTitle = $('services-title').value.trim();
    site.servicesSubtitle = $('services-subtitle').value.trim();
    site.mastersTitle = $('masters-title').value.trim();
    site.mastersSubtitle = $('masters-subtitle').value.trim();
    site.priceNote = $('price-note').value.trim();
    site.heroImage = $('hero-url').value.trim();
    site.telegram = $('telegram-url').value.trim();
    site.telegramUsername = $('telegram-username').value.trim();
    site.hours = $('hours').value.trim();
    site.orderConfirm = $('order-confirm').value.trim();
    site.visitTime = $('visit-time').value.trim();
    site.address = $('address').value.trim();
    site.lat = parseFloat($('lat').value) || 0;
    site.lng = parseFloat($('lng').value) || 0;
    site.contactsSubtitle = $('contacts-subtitle').value.trim();
    site.services = collectServices();
    site.masters = collectMasters();
    return site;
  }

  function serviceCard(s, index) {
    return `
      <div class="admin-card p-5 rounded-2xl bg-dark-card border border-dark-border" data-service-index="${index}">
        <div class="flex items-center justify-between gap-3 mb-4">
          <span class="text-gold font-medium text-sm">Услуга ${index + 1}</span>
          <button type="button" data-remove-service="${index}" class="text-red-400/80 hover:text-red-400 text-sm">Удалить</button>
        </div>
        <div class="grid gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Название</label>
            <input data-s-name="${index}" type="text" value="${escAttr(s.name)}" class="admin-input w-full px-3 py-2 rounded-lg bg-dark border border-dark-border text-sm" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-gray-500 mb-1">Цена</label>
              <input data-s-price="${index}" type="text" value="${escAttr(s.price)}" class="admin-input w-full px-3 py-2 rounded-lg bg-dark border border-dark-border text-sm" placeholder="50 сом" />
            </div>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Описание</label>
            <textarea data-s-desc="${index}" rows="2" class="admin-input w-full px-3 py-2 rounded-lg bg-dark border border-dark-border text-sm resize-y">${escHtml(s.description)}</textarea>
          </div>
        </div>
      </div>`;
  }

  function masterCard(m, index) {
    return `
      <div class="admin-card p-5 rounded-2xl bg-dark-card border border-dark-border" data-master-index="${index}">
        <div class="flex flex-col sm:flex-row gap-5">
          <div class="shrink-0 w-full sm:w-28">
            <img data-m-preview="${index}" src="${escAttr(m.image)}" alt="" class="master-preview w-full rounded-xl border border-dark-border bg-dark object-cover" />
            <label class="mt-2 cursor-pointer block text-center text-xs text-gold hover:underline">
              <input data-m-file="${index}" type="file" accept="image/*" class="hidden" />
              Сменить фото
            </label>
          </div>
          <div class="flex-grow space-y-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-gold font-medium text-sm">Мастер ${index + 1}</span>
              <button type="button" data-remove-master="${index}" class="text-red-400/80 hover:text-red-400 text-sm">Удалить</button>
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">Имя</label>
              <input data-m-name="${index}" type="text" value="${escAttr(m.name)}" class="admin-input w-full px-3 py-2 rounded-lg bg-dark border border-dark-border text-sm" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">Описание</label>
              <input data-m-desc="${index}" type="text" value="${escAttr(m.description)}" class="admin-input w-full px-3 py-2 rounded-lg bg-dark border border-dark-border text-sm" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">Ссылка на фото</label>
              <input data-m-image="${index}" type="text" value="${escAttr(m.image)}" class="admin-input w-full px-3 py-2 rounded-lg bg-dark border border-dark-border text-sm" placeholder="images/... или https://..." />
            </div>
          </div>
        </div>
      </div>`;
  }

  function escAttr(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderServices() {
    const list = $('services-list');
    if (!list) return;
    list.innerHTML = (site.services || []).map(serviceCard).join('');
    wireServiceEvents();
  }

  function renderMasters() {
    const list = $('masters-list');
    if (!list) return;
    list.innerHTML = (site.masters || []).map(masterCard).join('');
    wireMasterEvents();
  }

  function collectServices() {
    return (site.services || []).map((_, i) => ({
      name: document.querySelector(`[data-s-name="${i}"]`)?.value.trim() || '',
      price: document.querySelector(`[data-s-price="${i}"]`)?.value.trim() || '',
      description: document.querySelector(`[data-s-desc="${i}"]`)?.value.trim() || '',
    }));
  }

  function collectMasters() {
    return (site.masters || []).map((_, i) => ({
      name: document.querySelector(`[data-m-name="${i}"]`)?.value.trim() || '',
      description: document.querySelector(`[data-m-desc="${i}"]`)?.value.trim() || '',
      image: document.querySelector(`[data-m-image="${i}"]`)?.value.trim() || '',
    }));
  }

  function wireServiceEvents() {
    document.querySelectorAll('[data-remove-service]').forEach((btn) => {
      btn.onclick = () => {
        const i = +btn.dataset.removeService;
        site.services.splice(i, 1);
        renderServices();
      };
    });
  }

  function wireMasterEvents() {
    document.querySelectorAll('[data-remove-master]').forEach((btn) => {
      btn.onclick = () => {
        const i = +btn.dataset.removeMaster;
        site.masters.splice(i, 1);
        renderMasters();
      };
    });

    document.querySelectorAll('[data-m-image]').forEach((input) => {
      input.addEventListener('input', () => {
        const i = input.dataset.mImage;
        const preview = document.querySelector(`[data-m-preview="${i}"]`);
        if (preview && input.value) preview.src = input.value;
      });
    });

    document.querySelectorAll('[data-m-file]').forEach((input) => {
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) {
          toast('Фото больше 8 МБ', true);
          return;
        }
        const i = input.dataset.mFile;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            toast('Загрузка фото…');
            const data = await api('/api/admin/upload-image', {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({ image: reader.result, prefix: 'master' }),
            });
            const urlInput = document.querySelector(`[data-m-image="${i}"]`);
            if (urlInput) {
              urlInput.value = data.path;
              urlInput.dispatchEvent(new Event('input'));
            }
            toast('Фото мастера загружено');
          } catch (err) {
            toast(err.message, true);
          }
        };
        reader.readAsDataURL(file);
        input.value = '';
      });
    });
  }

  $('add-service')?.addEventListener('click', () => {
    if (!site.services) site.services = [];
    site.services.push({ name: 'Новая услуга', price: '', description: '' });
    renderServices();
  });

  $('add-master')?.addEventListener('click', () => {
    if (!site.masters) site.masters = [];
    site.masters.push({
      name: 'Новый мастер',
      description: 'Опыт · специализация',
      image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
    });
    renderMasters();
  });

  $('hero-file')?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast('Файл больше 8 МБ', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        toast('Загрузка фона…');
        const data = await api('/api/admin/upload-hero', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ image: reader.result }),
        });
        site.heroImage = data.path;
        $('hero-url').value = data.path;
        updateHeroPreview(data.path);
        toast('Фон загружен');
      } catch (err) {
        toast(err.message, true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  async function loadSite() {
    site = await api('/api/site');
    fillForm();
  }

  async function saveSite() {
    if (saving) return;
    saving = true;
    const btn = $('btn-save');
    const prev = btn?.textContent;
    if (btn) {
      btn.textContent = 'Сохранение…';
      btn.disabled = true;
    }
    try {
      collectFromForm();
      await api('/api/admin/site', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(site),
      });
      toast('Сохранено! Обновите сайт (F5)');
    } catch (err) {
      toast(err.message, true);
    } finally {
      saving = false;
      if (btn) {
        btn.textContent = prev;
        btn.disabled = false;
      }
    }
  }

  $('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('login-error');
    errEl?.classList.add('hidden');
    try {
      const data = await api('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: $('login-password').value }),
      });
      setToken(data.token);
      showApp(true);
      await loadSite();
      toast('Добро пожаловать');
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message === 'Сессия истекла — войдите снова' ? 'Неверный пароль' : err.message;
        errEl.classList.remove('hidden');
      }
    }
  });

  $('btn-save')?.addEventListener('click', saveSite);

  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      document.querySelectorAll('.admin-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
      document.querySelectorAll('.tab-panel').forEach((p) => {
        p.classList.toggle('hidden', p.id !== `panel-${name}`);
      });
    });
  });

  ['brand-name', 'brand-label', 'brand-tagline', 'brand-subtitle'].forEach((id, i) => {
    const keys = ['name', 'label', 'tagline', 'subtitle'];
    bind(id, keys[i], 'brand');
  });

  async function init() {
    if (getToken()) {
      try {
        showApp(true);
        await loadSite();
        return;
      } catch (_) {
        setToken(null);
      }
    }
    showApp(false);
  }

  init();
})();
