const fs = require('fs');
const path = require('path');

const ADMIN_FILE = path.join(__dirname, '..', 'data', 'telegram-admin.json');
const APPOINTMENT_TIMES = Array.from({ length: 16 }, (_, i) => `${i + 8}:00`);

function loadAdminChatId() {
  try {
    if (fs.existsSync(ADMIN_FILE)) {
      const data = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
      return data.chatId || null;
    }
  } catch (_) {}
  return null;
}

function saveAdminChatId(chatId) {
  fs.writeFileSync(ADMIN_FILE, JSON.stringify({ chatId }, null, 2) + '\n', 'utf8');
}

function createTelegramBot(token, getSite) {
  if (!token) return { start: () => {} };

  const LOCATION_TEXT = 'г. Душанбе, ул. Примерная, 12';

  const api = (method, body) =>
    fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json());

  let offset = 0;
  let running = false;
  /** Ожидание следующего шага заказа: chatId → { serviceIndex, masterIndex, awaitingTime, sequenceReady, userMessage } */
  const pendingService = new Map();
  const visitTimeSequenceTimers = new Map();

  function clearVisitTimeSequence(chatId) {
    const timers = visitTimeSequenceTimers.get(chatId);
    if (timers) timers.forEach((id) => clearTimeout(id));
    visitTimeSequenceTimers.delete(chatId);
  }

  async function promptVisitTime(chatId, extra = {}) {
    clearVisitTimeSequence(chatId);
    pendingService.set(chatId, {
      serviceIndex: extra.serviceIndex ?? null,
      masterIndex: extra.masterIndex ?? null,
      userMessage: '',
      awaitingTime: true,
      sequenceReady: true,
    });
    await sendMessage(
      chatId,
      `🕐 <b>Во сколько вы придёте?</b>\nВыберите кнопку или напишите время (например <code>14:30</code>).\n\n📍 ${LOCATION_TEXT}`,
      { reply_markup: timeKeyboard() }
    );
  }

  async function sendMessage(chatId, text, extra = {}) {
    return api('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
  }

  function brandName(site) {
    return site?.brand?.name || 'SEVEN';
  }

  function servicesKeyboard(site) {
    const rows = [];
    const services = site?.services || [];
    for (let i = 0; i < services.length; i += 2) {
      const row = [];
      for (let j = i; j < Math.min(i + 2, services.length); j++) {
        const s = services[j];
        const label = `${s.name} · ${s.price}`.slice(0, 60);
        row.push({ text: label, callback_data: `svc_${j}` });
      }
      rows.push(row);
    }
    return { inline_keyboard: rows };
  }

  function mastersKeyboard(site) {
    const rows = [];
    const masters = site?.masters || [];
    for (let i = 0; i < masters.length; i += 2) {
      const row = [];
      for (let j = i; j < Math.min(i + 2, masters.length); j++) {
        row.push({ text: masters[j].name, callback_data: `mst_${j}` });
      }
      rows.push(row);
    }
    return { inline_keyboard: rows };
  }

  function timeKeyboard() {
    const rows = [];
    for (let i = 0; i < APPOINTMENT_TIMES.length; i += 4) {
      rows.push(
        APPOINTMENT_TIMES.slice(i, i + 4).map((time) => ({
          text: time,
          callback_data: `time_${time}`,
        }))
      );
    }
    rows.push([{ text: '✖ Отмена', callback_data: 'cancel_order' }]);
    return { inline_keyboard: rows };
  }

  const mainReplyKeyboard = {
    keyboard: [
      [{ text: '📋 Услуги' }, { text: '👨 Мастера' }],
      [{ text: '📍 Адрес' }],
    ],
    resize_keyboard: true,
  };

  async function setupCommands() {
    const site = getSite();
    const name = brandName(site);
    await api('setMyCommands', {
      commands: [
        { command: 'start', description: 'Заказать' },
        { command: 'uslugi', description: 'Услуги с кнопками' },
        { command: 'mastera', description: 'Выбрать мастера' },
        { command: 'adres', description: 'Адрес и часы' },
      ],
    });
    await api('setMyDescription', {
      description: `${name} — услуга, потом мастер. Список мастеров с сайта (админка).`,
    });
  }

  function welcomeText(site) {
    const name = brandName(site);
    const masterNames = (site.masters || []).map((m) => m.name).join(', ') || '—';
    return (
      `✂️ <b>${name}</b>\n\n` +
      `1️⃣ Нажмите <b>услугу</b>\n` +
      `2️⃣ Выберите <b>мастера</b>\n` +
      `3️⃣ Выберите <b>время</b>\n\n` +
      `Мастера сейчас: <i>${masterNames}</i>\n` +
      `(меняете в админке → Сохранить — в боте сразу новые)\n\n` +
      `📋 Услуги · 👨 Мастера · 📍 Адрес`
    );
  }

  function servicesText(site) {
    if (!site?.services?.length) return 'Услуги пока не добавлены.';
    return (
      `<b>Услуги ${brandName(site)}</b> — нажмите кнопку, чтобы заказать:\n\n` +
      site.services.map((s, i) => `${i + 1}. <b>${s.name}</b> — ${s.price}`).join('\n')
    );
  }

  function mastersText(site) {
    if (!site?.masters?.length) return 'Мастера пока не добавлены.';
    return (
      `<b>Мастера ${brandName(site)}</b> — выберите:\n\n` +
      site.masters.map((m) => `• <b>${m.name}</b> — ${m.description}`).join('\n')
    );
  }

  function addressText(site) {
    return `<b>Адрес:</b> ${site.address || '—'}\n<b>Часы:</b> ${site.hours || '—'}`;
  }

  async function notifyAdmin(adminId, customer, orderText) {
    if (!adminId || adminId === customer.chatId) return;
    const name = customer.firstName || 'Клиент';
    await sendMessage(
      adminId,
      `📩 <b>Новый заказ</b>\n\n` +
        `От: ${name}${customer.username ? ` (@${customer.username})` : ''}\n` +
        `Написать: <a href="tg://user?id=${customer.chatId}">клиенту</a>\n\n` +
        `${orderText}`
    );
  }

  function clientConfirmText(site, orderText) {
    const title = site.orderConfirm || 'Заявка принята!';
    const visit = (site.visitTime || '').trim();
    return `✅ <b>${title}</b>\n\n${orderText}${visit ? `\n\n🕐 ${visit}` : ''}`;
  }

  function clientTimeConfirmText(orderText, time) {
    return `✅ <b>Заявка принята!</b>\n\n${orderText}\n\nХорошо, ждём вас в <b>${time}</b>.`;
  }

  function availableTimesText() {
    const rows = [];
    for (let i = 0; i < APPOINTMENT_TIMES.length; i += 4) {
      rows.push(APPOINTMENT_TIMES.slice(i, i + 4).join(' '));
    }
    return rows.join('\n');
  }

  function invalidVisitTimeText() {
    return 'Напишите ещё раз: во сколько вы придёте?';
  }

  /** Буквы/символы или неверное время — не запускать заново цепочку приветствие→адрес */
  function isRejectedTimeInput(text) {
    const value = (text || '').trim();
    if (!value) return true;
    if (parseVisitTime(value)) return false;
    if (/\d/.test(value)) return true;
    if (/[a-zA-Z]/.test(value)) return true;
    return false;
  }

  function formatVisitTime(hour, minute) {
    return `${hour}:${String(minute).padStart(2, '0')}`;
  }

  function parseVisitTime(text) {
    const value = (text || '').trim().replace(/\s+/g, '');
    if (!value) return null;

    const clockMatch = value.match(/^(\d{1,2})[:.\-](\d{2})$/);
    if (clockMatch) {
      const hour = Number(clockMatch[1]);
      const minute = Number(clockMatch[2]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return formatVisitTime(hour, minute);
      }
      return null;
    }

    if (!/^\d+$/.test(value)) return null;

    if (value.length <= 2) {
      const hour = Number(value);
      if (hour >= 0 && hour <= 23) return formatVisitTime(hour, 0);
      return null;
    }

    if (value.length === 3) {
      const hour = Number(value[0]);
      const minute = Number(value.slice(1));
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return formatVisitTime(hour, minute);
      }
      return null;
    }

    if (value.length === 4) {
      const hour = Number(value.slice(0, 2));
      const minute = Number(value.slice(2));
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return formatVisitTime(hour, minute);
      }
      return null;
    }

    return null;
  }

  async function confirmOrder(chatId, orderText, customer) {
    const site = getSite();
    await sendMessage(chatId, clientConfirmText(site, orderText), {
      reply_markup: mainReplyKeyboard,
    });
    const adminId = loadAdminChatId();
    await notifyAdmin(adminId, customer, orderText);
  }

  async function sendServicesMenu(chatId) {
    const site = getSite();
    await sendMessage(chatId, servicesText(site), {
      reply_markup: servicesKeyboard(site),
    });
  }

  async function sendMastersMenu(chatId) {
    const site = getSite();
    await sendMessage(chatId, mastersText(site), {
      reply_markup: mastersKeyboard(site),
    });
  }

  async function selectService(chatId, serviceIndex, customer) {
    const site = getSite();
    const s = site.services?.[serviceIndex];
    if (!s) return false;
    const masters = site.masters || [];
    if (!masters.length) {
      const orderText = `🛎 <b>Услуга:</b> ${s.name}\n💰 ${s.price}`;
      await confirmOrder(chatId, orderText, customer);
      return true;
    }
    pendingService.set(chatId, { serviceIndex });
    const kb = mastersKeyboard(site);
    kb.inline_keyboard.push([{ text: '✖ Отмена', callback_data: 'cancel_order' }]);
    await sendMessage(
      chatId,
      `🛎 <b>${s.name}</b> — ${s.price}\n\n👨 <b>Кого выбираете?</b> (мастера из админки):`,
      { reply_markup: kb }
    );
    return true;
  }

  async function selectMaster(chatId, masterIndex, customer) {
    const site = getSite();
    const m = site.masters?.[masterIndex];
    if (!m) return false;
    const pending = pendingService.get(chatId);
    if (pending != null) {
      const s = site.services?.[pending.serviceIndex];
      await sendMessage(chatId, `🛎 <b>${s?.name || 'Услуга'}</b>\n👨 <b>${m.name}</b>`);
      await promptVisitTime(chatId, {
        serviceIndex: pending.serviceIndex,
        masterIndex,
      });
    } else {
      await sendMessage(chatId, `👨 <b>${m.name}</b>`);
      await promptVisitTime(chatId, { masterIndex });
    }
    return true;
  }

  async function handleCallbackQuery(q) {
    const chatId = q.message?.chat?.id;
    const data = q.data || '';
    const site = getSite();
    const customer = {
      chatId,
      firstName: q.from?.first_name,
      username: q.from?.username,
    };

    await api('answerCallbackQuery', { callback_query_id: q.id });

    if (data === 'cancel_order') {
      clearVisitTimeSequence(chatId);
      pendingService.delete(chatId);
      await sendMessage(chatId, 'Заказ отменён. Нажмите /start', {
        reply_markup: servicesKeyboard(getSite()),
      });
      return;
    }

    if (data.startsWith('svc_')) {
      const i = parseInt(data.slice(4), 10);
      await selectService(chatId, i, customer);
      return;
    }

    if (data.startsWith('mst_')) {
      const i = parseInt(data.slice(4), 10);
      await selectMaster(chatId, i, customer);
      return;
    }

    if (data.startsWith('time_')) {
      const time = data.slice(5);
      const pending = pendingService.get(chatId);
      if (!pending) {
        await sendMessage(chatId, 'Сначала выберите услугу и мастера. Нажмите /start');
        return;
      }
      const s = pending.serviceIndex != null ? site.services?.[pending.serviceIndex] : null;
      const m = pending.masterIndex != null ? site.masters?.[pending.masterIndex] : null;
      pendingService.delete(chatId);
      const orderText =
        (s ? `🛎 <b>Услуга:</b> ${s.name}\n💰 ${s.price}\n\n` : '') +
        (m ? `👨 <b>Мастер:</b> ${m.name}\n<i>${m.description}</i>\n\n` : '') +
        `🕐 <b>Время:</b> ${time}`;
      await sendMessage(chatId, clientTimeConfirmText(orderText, time), {
        reply_markup: mainReplyKeyboard,
      });
      const adminId = loadAdminChatId();
      await notifyAdmin(adminId, customer, orderText);
    }
  }

  async function handleMessage(msg) {
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();
    const site = getSite();
    let adminId = loadAdminChatId();

    const customer = {
      chatId,
      firstName: msg.from?.first_name,
      username: msg.from?.username,
    };

    if (text === '/start' || text.startsWith('/start ')) {
      clearVisitTimeSequence(chatId);
      pendingService.delete(chatId);
      if (!adminId && msg.chat.type === 'private') {
        saveAdminChatId(chatId);
        console.log(`Telegram: владелец подключён (chat ${chatId})`);
      }

      const payload = text.startsWith('/start ') ? text.slice(7).trim() : '';
      if (payload.startsWith('svc_')) {
        const i = parseInt(payload.slice(4), 10);
        await sendMessage(chatId, welcomeText(site));
        await selectService(chatId, i, customer);
        return;
      }
      if (payload.startsWith('mst_')) {
        const i = parseInt(payload.slice(4), 10);
        await sendMessage(chatId, welcomeText(site));
        await selectMaster(chatId, i, customer);
        return;
      }

      await sendMessage(chatId, welcomeText(site), {
        reply_markup: servicesKeyboard(site),
      });
      return;
    }

    if (text === '/uslugi' || text === '📋 Услуги') {
      await sendServicesMenu(chatId);
      return;
    }

    if (text === '/mastera' || text === '👨 Мастера') {
      await sendMastersMenu(chatId);
      return;
    }

    if (text === '/adres' || text === '📍 Адрес') {
      await sendMessage(chatId, addressText(site), { reply_markup: mainReplyKeyboard });
      return;
    }

    if (msg.chat.type !== 'private') return;

    const pending = pendingService.get(chatId);
    if (pending?.awaitingTime && !pending.sequenceReady) return;

    const canAnswerTime =
      pending &&
      pending.sequenceReady &&
      (pending.serviceIndex != null ||
        pending.masterIndex != null ||
        pending.awaitingTime);

    if (canAnswerTime) {
      const time = parseVisitTime(text);
      if (!time) {
        await sendMessage(chatId, invalidVisitTimeText());
        return;
      }
      clearVisitTimeSequence(chatId);
      const s = pending.serviceIndex != null ? site.services?.[pending.serviceIndex] : null;
      const m = pending.masterIndex != null ? site.masters?.[pending.masterIndex] : null;
      pendingService.delete(chatId);
      const orderText =
        (s ? `🛎 <b>Услуга:</b> ${s.name}\n💰 ${s.price}\n\n` : '') +
        (m ? `👨 <b>Мастер:</b> ${m.name}\n<i>${m.description}</i>\n\n` : '') +
        `🕐 <b>Время:</b> ${time}`;
      await sendMessage(chatId, clientTimeConfirmText(orderText, time), {
        reply_markup: mainReplyKeyboard,
      });
      const adminId = loadAdminChatId();
      await notifyAdmin(adminId, customer, orderText);
      return;
    }

    if (isRejectedTimeInput(text)) {
      await sendMessage(chatId, invalidVisitTimeText(), { reply_markup: mainReplyKeyboard });
      return;
    }

    const messagePreview = text.slice(0, 500);
    await notifyAdmin(adminId, customer, `💬 <b>Сообщение:</b>\n${messagePreview}`);
    await sendMessage(
      chatId,
      'Для записи нажмите <b>/start</b>, выберите <b>услугу</b> и <b>мастера</b> кнопками.',
      { reply_markup: mainReplyKeyboard }
    );
  }

  async function poll() {
    if (!running) return;
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?timeout=30&offset=${offset}`
      );
      const data = await res.json();
      if (data.ok && data.result?.length) {
        for (const u of data.result) {
          offset = u.update_id + 1;
          if (u.callback_query) await handleCallbackQuery(u.callback_query);
          if (u.message) await handleMessage(u.message);
        }
      }
    } catch (err) {
      console.error('Telegram poll:', err.message);
    }
    if (running) setTimeout(poll, 500);
  }

  async function start() {
    running = true;
    try {
      const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json());
      if (me.ok) {
        console.log(`Telegram бот: @${me.result.username}`);
        await setupCommands();
      } else {
        console.error('Telegram: неверный токен');
        running = false;
        return;
      }
    } catch (err) {
      console.error('Telegram:', err.message);
      running = false;
      return;
    }
    poll();
  }

  function stop() {
    running = false;
  }

  return { start, stop };
}

module.exports = { createTelegramBot, loadAdminChatId };
