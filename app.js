const users = [
  { id: 'u1', name: 'Анна', groupIds: ['g1'] },
  { id: 'u2', name: 'Борис', groupIds: ['g1', 'g2'] },
  { id: 'u3', name: 'Сергей', groupIds: ['g2'] },
  { id: 'u4', name: 'Мария', groupIds: ['g3'] }
];

const groups = [
  { id: 'g1', name: 'Логистика' },
  { id: 'g2', name: 'Продажи' },
  { id: 'g3', name: 'Сервис' }
];

const pointStoreKey = 'geogroups.points';
const chatStoreKey = 'geogroups.messages';

const state = {
  currentUserId: users[0].id,
  selectedLatLng: null,
  points: loadData(pointStoreKey, [
    {
      id: crypto.randomUUID(),
      userId: 'u1',
      groupId: 'g1',
      title: 'База на севере',
      description: 'Временный склад',
      lat: 55.78,
      lng: 37.56
    },
    {
      id: crypto.randomUUID(),
      userId: 'u2',
      groupId: 'g2',
      title: 'Клиентская точка',
      description: 'Демо-зона',
      lat: 55.74,
      lng: 37.64
    }
  ]),
  messages: loadData(chatStoreKey, [
    {
      id: crypto.randomUUID(),
      from: 'u1',
      to: 'u2',
      text: 'Привет! Проверь новую точку на карте.',
      timestamp: Date.now() - 7200000
    }
  ])
};

const map = L.map('map').setView([55.751244, 37.618423], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);

const currentUserSelect = document.getElementById('currentUser');
const userFilter = document.getElementById('userFilter');
const groupFilters = document.getElementById('groupFilters');
const pointForm = document.getElementById('pointForm');
const pointIdInput = document.getElementById('pointId');
const pointTitle = document.getElementById('pointTitle');
const pointDescription = document.getElementById('pointDescription');
const pointGroup = document.getElementById('pointGroup');
const pointCoords = document.getElementById('pointCoords');
const cancelEdit = document.getElementById('cancelEdit');
const chatPartner = document.getElementById('chatPartner');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');

init();

function init() {
  fillSelect(currentUserSelect, users, 'Выберите пользователя');
  fillSelect(userFilter, users, 'Все пользователи', true);
  fillSelect(pointGroup, groups, 'Выберите группу');

  currentUserSelect.value = state.currentUserId;

  renderGroupFilters();
  bindEvents();
  refreshMap();
  refreshChatPartners();
  refreshChat();
}

function bindEvents() {
  map.on('click', (event) => {
    state.selectedLatLng = event.latlng;
    pointCoords.value = `${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}`;
    if (!pointIdInput.value) {
      pointTitle.focus();
    }
  });

  currentUserSelect.addEventListener('change', () => {
    state.currentUserId = currentUserSelect.value;
    refreshMap();
    refreshChatPartners();
    refreshChat();
    resetPointForm();
  });

  userFilter.addEventListener('change', refreshMap);
  groupFilters.addEventListener('change', refreshMap);

  pointForm.addEventListener('submit', onPointSubmit);
  cancelEdit.addEventListener('click', resetPointForm);

  chatPartner.addEventListener('change', refreshChat);
  chatForm.addEventListener('submit', onSendMessage);
}

function onPointSubmit(event) {
  event.preventDefault();
  const isEditing = Boolean(pointIdInput.value);
  const activeUserId = state.currentUserId;

  if (!state.selectedLatLng && !isEditing) {
    alert('Сначала кликните по карте, чтобы выбрать координаты.');
    return;
  }

  if (!pointGroup.value) {
    alert('Выберите группу для точки.');
    return;
  }

  if (isEditing) {
    const point = state.points.find((item) => item.id === pointIdInput.value);
    if (!point || point.userId !== activeUserId) {
      alert('Можно редактировать только свои точки.');
      return;
    }

    point.title = pointTitle.value.trim();
    point.description = pointDescription.value.trim();
    point.groupId = pointGroup.value;

    if (state.selectedLatLng) {
      point.lat = state.selectedLatLng.lat;
      point.lng = state.selectedLatLng.lng;
    }
  } else {
    state.points.push({
      id: crypto.randomUUID(),
      userId: activeUserId,
      groupId: pointGroup.value,
      title: pointTitle.value.trim(),
      description: pointDescription.value.trim(),
      lat: state.selectedLatLng.lat,
      lng: state.selectedLatLng.lng
    });
  }

  persistData(pointStoreKey, state.points);
  refreshMap();
  resetPointForm();
}

function refreshMap() {
  markerLayer.clearLayers();

  const selectedUser = userFilter.value;
  const checkedGroups = [...groupFilters.querySelectorAll('input:checked')].map((input) => input.value);

  const filtered = state.points.filter((point) => {
    const byUser = selectedUser === 'all' || point.userId === selectedUser;
    const byGroup = checkedGroups.length === 0 || checkedGroups.includes(point.groupId);
    return byUser && byGroup;
  });

  filtered.forEach((point) => {
    const user = users.find((item) => item.id === point.userId);
    const group = groups.find((item) => item.id === point.groupId);

    const marker = L.marker([point.lat, point.lng]).addTo(markerLayer);
    const canEdit = point.userId === state.currentUserId;

    marker.bindPopup(`
      <div>
        <strong>${escapeHtml(point.title)}</strong><br/>
        <small>${escapeHtml(group?.name ?? 'Без группы')} · ${escapeHtml(user?.name ?? 'Неизвестный')}</small>
        <p>${escapeHtml(point.description || 'Без описания')}</p>
        ${canEdit ? `<button data-edit="${point.id}" class="popup-action">Редактировать</button>
                    <button data-delete="${point.id}" class="popup-action">Удалить</button>` : ''}
      </div>
    `);

    marker.on('popupopen', () => {
      const popup = marker.getPopup().getElement();
      popup.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', () => startEdit(btn.dataset.edit));
      });
      popup.querySelectorAll('[data-delete]').forEach((btn) => {
        btn.addEventListener('click', () => removePoint(btn.dataset.delete));
      });
    });
  });
}

function startEdit(pointId) {
  const point = state.points.find((item) => item.id === pointId);
  if (!point || point.userId !== state.currentUserId) {
    alert('Можно редактировать только свои точки.');
    return;
  }

  pointIdInput.value = point.id;
  pointTitle.value = point.title;
  pointDescription.value = point.description;
  pointGroup.value = point.groupId;
  pointCoords.value = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
  state.selectedLatLng = { lat: point.lat, lng: point.lng };

  map.setView([point.lat, point.lng], 13);
}

function removePoint(pointId) {
  const point = state.points.find((item) => item.id === pointId);
  if (!point || point.userId !== state.currentUserId) {
    alert('Можно удалять только свои точки.');
    return;
  }

  state.points = state.points.filter((item) => item.id !== pointId);
  persistData(pointStoreKey, state.points);
  refreshMap();
  if (pointIdInput.value === pointId) {
    resetPointForm();
  }
}

function resetPointForm() {
  pointForm.reset();
  pointIdInput.value = '';
  pointCoords.value = '';
  state.selectedLatLng = null;
}

function refreshChatPartners() {
  const available = users.filter((user) => user.id !== state.currentUserId);
  chatPartner.innerHTML = '';
  available.forEach((user) => {
    const option = document.createElement('option');
    option.value = user.id;
    option.textContent = user.name;
    chatPartner.append(option);
  });
}

function refreshChat() {
  const partnerId = chatPartner.value;
  chatMessages.innerHTML = '';

  if (!partnerId) {
    chatMessages.innerHTML = '<p>Выберите собеседника.</p>';
    return;
  }

  const conversation = state.messages
    .filter((message) => {
      const a = message.from === state.currentUserId && message.to === partnerId;
      const b = message.from === partnerId && message.to === state.currentUserId;
      return a || b;
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  if (conversation.length === 0) {
    chatMessages.innerHTML = '<p>Сообщений пока нет.</p>';
    return;
  }

  conversation.forEach((message) => {
    const author = users.find((user) => user.id === message.from);
    const item = document.createElement('div');
    item.className = `chat-item ${message.from === state.currentUserId ? 'me' : ''}`;
    item.innerHTML = `
      <div class="chat-meta">${author?.name ?? 'Неизвестно'} · ${new Date(message.timestamp).toLocaleString('ru-RU')}</div>
      <div>${escapeHtml(message.text)}</div>
    `;
    chatMessages.append(item);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function onSendMessage(event) {
  event.preventDefault();
  const partnerId = chatPartner.value;
  const text = chatInput.value.trim();
  if (!partnerId || !text) {
    return;
  }

  state.messages.push({
    id: crypto.randomUUID(),
    from: state.currentUserId,
    to: partnerId,
    text,
    timestamp: Date.now()
  });

  persistData(chatStoreKey, state.messages);
  chatInput.value = '';
  refreshChat();
}

function renderGroupFilters() {
  groupFilters.innerHTML = '';
  groups.forEach((group) => {
    const wrapper = document.createElement('label');
    wrapper.innerHTML = `<input type="checkbox" value="${group.id}" /> ${group.name}`;
    groupFilters.append(wrapper);
  });
}

function fillSelect(select, items, defaultText, withAll = false) {
  if (!withAll) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = defaultText;
    placeholder.disabled = true;
    placeholder.selected = true;
    select.append(placeholder);
  }

  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    select.append(option);
  });
}

function persistData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function loadData(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
