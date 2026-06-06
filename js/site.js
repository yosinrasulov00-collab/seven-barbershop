(function () {
  'use strict';

  function tgOrder(telegram, startPayload) {
    const base = telegram.split('?')[0];
    return `${base}?start=${encodeURIComponent(startPayload)}`;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function renderServices(site) {
    const grid = document.getElementById('services-grid');
    if (!grid) return;
    grid.innerHTML = site.services
      .map(
        (s, i) => `
      <article class="reveal service-card card-hover flex flex-col p-6 rounded-2xl bg-dark-card border border-dark-border" style="transition-delay: ${i * 0.05}s">
        <span class="service-number">0${i + 1}</span>
        <div class="flex items-start justify-between gap-3 mb-3">
          <h3 class="font-display text-xl font-semibold text-gold">${esc(s.name)}</h3>
          <span class="text-gold font-semibold whitespace-nowrap">${esc(s.price)}</span>
        </div>
        <p class="text-gray-400 text-sm leading-relaxed flex-grow mb-5">${esc(s.description)}</p>
        <a href="${tgOrder(site.telegram, `svc_${i}`)}" target="_blank" rel="noopener noreferrer" class="card-order-btn inline-flex justify-center py-2.5 rounded-full border border-gold text-gold text-sm font-medium hover:bg-gold hover:text-dark transition-all duration-300">Заказать в Telegram</a>
      </article>`
      )
      .join('');
  }

  function renderMasters(site) {
    const grid = document.getElementById('masters-grid');
    if (!grid) return;
    grid.innerHTML = site.masters
      .map(
        (m, i) => `
      <article class="reveal master-card group rounded-2xl overflow-hidden bg-dark-card border border-dark-border" style="transition-delay: ${i * 0.1}s">
        <div class="aspect-[3/4] overflow-hidden">
          <img src="${esc(m.image)}" alt="${esc(m.name)}" class="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-110" loading="lazy" />
        </div>
        <div class="p-5">
          <h3 class="font-display text-xl font-semibold text-gold">${esc(m.name)}</h3>
          <p class="text-gray-400 text-sm mt-1 mb-4">${esc(m.description)}</p>
          <a href="${tgOrder(site.telegram, `mst_${i}`)}" target="_blank" rel="noopener noreferrer" class="card-order-btn inline-flex w-full justify-center py-2.5 rounded-full border border-gold text-gold text-sm font-medium hover:bg-gold hover:text-dark transition-all duration-300">Заказать в Telegram</a>
        </div>
      </article>`
      )
      .join('');
  }

  function applySite(site) {
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el && val != null) el.textContent = val;
    };

    document.title = `${site.brand.name} — Barber Shop`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = `${site.brand.name} — ${site.brand.tagline}. Заказ в Telegram.`;

    setText('brand-label', site.brand.label);
    setText('brand-name', site.brand.name);
    setText('footer-brand', site.brand.name);
    setText('hero-tagline', site.brand.tagline);
    setText('hero-title', site.brand.name);
    setText('hero-subtitle', site.brand.subtitle);
    setText('hero-address', site.address);
    setText('services-title-prefix', site.servicesTitle);
    setText('services-brand', site.brand.name);
    setText('services-subtitle', site.servicesSubtitle);
    setText('masters-title', site.mastersTitle);
    setText('masters-subtitle', site.mastersSubtitle);
    setText('contacts-subtitle', site.contactsSubtitle);
    setText('contacts-telegram', site.telegramUsername);
    setText('contacts-address', site.address);
    setText('contacts-hours', site.hours);
    setText('price-note', site.priceNote);

    const heroImg = document.getElementById('hero-bg-img');
    if (heroImg && site.heroImage) heroImg.src = site.heroImage;

    const mapHero = document.getElementById('hero-map-link');
    const mapContacts = document.getElementById('contacts-map-link');
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${site.lat},${site.lng}`;
    if (mapHero) mapHero.href = mapUrl;
    if (mapContacts) mapContacts.href = mapUrl;

    document.querySelectorAll('[data-telegram]').forEach((el) => {
      el.href = site.telegram;
    });

    renderServices(site);
    renderMasters(site);

    window.dispatchEvent(new CustomEvent('site-loaded'));
  }

  fetch('/api/site')
    .then((r) => r.json())
    .then(applySite)
    .catch(() => {});
})();
