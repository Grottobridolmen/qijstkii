// UI helpers: HUD updates, inventory/shop/chat modals.

import { RESOURCE_NAMES, SELL_PRICE, UPGRADE_COST, TOOL_TIER_NAMES, PLACEABLE_RESOURCES } from './constants.js';

export class UI {
  constructor() {
    this.hpVal = document.getElementById('hpVal');
    this.coinsVal = document.getElementById('coinsVal');
    this.toolName = document.getElementById('toolName');
    this.depthVal = document.getElementById('depthVal');
    this.flashEl = document.getElementById('hud-flash');
    this.chatLogHud = document.getElementById('hud-chat');
    this.flashTimer = null;

    this.invModal = document.getElementById('invModal');
    this.invList = document.getElementById('invList');

    this.shopModal = document.getElementById('shopModal');
    this.sellList = document.getElementById('sellList');
    this.upgradeList = document.getElementById('upgradeList');

    this.chatModal = document.getElementById('chatModal');
    this.chatLog = document.getElementById('chatLog');
    this.chatInput = document.getElementById('chatInput');
    this.chatForm = document.getElementById('chatForm');

    this.deathOverlay = document.getElementById('deathOverlay');

    // Close buttons
    for (const b of document.querySelectorAll('.closeBtn')) {
      b.addEventListener('click', () => {
        b.closest('.modal')?.classList.add('hidden');
        b.closest('.overlay')?.classList.add('hidden');
      });
    }
  }

  setHud({ hp, coins, toolKind, toolTier, depth }) {
    if (hp !== undefined) this.hpVal.textContent = hp;
    if (coins !== undefined) this.coinsVal.textContent = coins;
    if (toolKind !== undefined && toolTier !== undefined) {
      const name = toolKind === 'shovel' ? 'Лопата' : 'Кирка';
      this.toolName.textContent = `${TOOL_TIER_NAMES[toolTier]} ${name.toLowerCase()}`;
    }
    if (depth !== undefined) this.depthVal.textContent = depth;
  }

  flash(msg, ms = 2500) {
    this.flashEl.textContent = msg;
    this.flashEl.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.flashEl.classList.remove('show');
    }, ms);
  }

  appendChatMessage(text) {
    // HUD log
    const div = document.createElement('div');
    div.className = 'msg';
    div.textContent = text;
    this.chatLogHud.prepend(div);
    while (this.chatLogHud.childNodes.length > 6) this.chatLogHud.lastChild.remove();
    // Modal log
    const div2 = document.createElement('div');
    div2.className = 'msg';
    div2.textContent = text;
    this.chatLog.appendChild(div2);
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
    setTimeout(() => div.remove(), 8000);
  }

  showInventory(inv, onPlaceSelect) {
    this.invList.innerHTML = '';
    const entries = Object.entries(inv);
    entries.sort();
    for (const [res, count] of entries) {
      if (count <= 0) continue;
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${RESOURCE_NAMES[res] || res}: ${count}`;
      li.appendChild(label);
      if (PLACEABLE_RESOURCES.includes(res)) {
        const btn = document.createElement('button');
        btn.textContent = 'Выбрать для постройки';
        btn.addEventListener('click', () => {
          onPlaceSelect(res);
          this.flash(`Выбрано: ${RESOURCE_NAMES[res] || res}`);
          this.invModal.classList.add('hidden');
        });
        li.appendChild(btn);
      }
      this.invList.appendChild(li);
    }
    if (!this.invList.childNodes.length) {
      this.invList.innerHTML = '<li>Пусто</li>';
    }
    this.invModal.classList.remove('hidden');
  }

  showShop(state, onSell, onUpgrade) {
    this.sellList.innerHTML = '';
    const inv = state.inv || {};
    for (const res of ['coal', 'iron', 'gold', 'diamond', 'stone', 'wood']) {
      const have = inv[res] || 0;
      const price = SELL_PRICE[res] || 0;
      if (price <= 0) continue;
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${RESOURCE_NAMES[res] || res}: ${have} × ${price}`;
      li.appendChild(label);
      const btnA = document.createElement('button');
      btnA.textContent = `Продать всё`;
      btnA.disabled = have <= 0;
      btnA.addEventListener('click', () => onSell(res, have));
      li.appendChild(btnA);
      this.sellList.appendChild(li);
    }
    this.upgradeList.innerHTML = '';
    for (const kind of ['shovel', 'pickaxe']) {
      const tier = state.tools?.[kind] ?? 0;
      const li = document.createElement('li');
      const label = document.createElement('span');
      const name = kind === 'shovel' ? 'Лопата' : 'Кирка';
      label.textContent = `${name}: ${TOOL_TIER_NAMES[tier]}`;
      li.appendChild(label);
      if (tier >= 4) {
        const span = document.createElement('span');
        span.textContent = 'Макс';
        li.appendChild(span);
      } else {
        const cost = UPGRADE_COST[kind][tier];
        const btn = document.createElement('button');
        btn.textContent = `Улучшить (${cost})`;
        btn.disabled = (state.coins || 0) < cost;
        btn.addEventListener('click', () => onUpgrade(kind));
        li.appendChild(btn);
      }
      this.upgradeList.appendChild(li);
    }
    this.shopModal.classList.remove('hidden');
  }

  closeShop() { this.shopModal.classList.add('hidden'); }
  closeInventory() { this.invModal.classList.add('hidden'); }
  toggleChat() { this.chatModal.classList.toggle('hidden'); }

  showDeath() { this.deathOverlay.classList.remove('hidden'); }
  hideDeath() { this.deathOverlay.classList.add('hidden'); }
}
