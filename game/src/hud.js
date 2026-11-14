// The DOM HUD. It never touches the simulation; main.js pushes numbers in and
// reads callbacks out. Every setter writes only when the value changed (the
// starter's change-only pattern), and the buy menu is a real DOM panel the
// player clicks or drives with keys 1-6.
import { CONFIG, BUY_ROWS } from './config.js';
import { clock } from './util.js';

const COPY = {
  start: { title: 'KILN YARD', copy: 'A decommissioned brickworks at dusk. Plant the charge at A or B — or drop all five Ash defenders. Click to play.', action: 'Click to play' },
  paused: { title: 'KILN YARD', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  end: { title: 'Round over', copy: '', action: 'Next round' },
  match: { title: 'Match over', copy: '', action: 'Play again' },
  dead: { title: 'You were dropped', copy: 'Spectating your squad until the round ends.', action: '' },
};

export function createHud(onBuy) {
  const $ = (id) => document.getElementById(id);
  const el = {
    overlay: $('overlay'), title: $('overlay-title'), copy: $('overlay-copy'), play: $('play'),
    banner: $('banner'), bannerText: $('banner-text'),
    health: $('health-num'), healthBar: $('health-bar'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), weaponName: $('weapon-name'), ammo: $('ammo'),
    money: $('money'), timer: $('timer'), score: $('score'),
    pipsEmber: $('pips-ember'), pipsAsh: $('pips-ash'),
    feed: $('feed'), bombLine: $('bomb-line'), hint: $('hint'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    buy: $('buy-menu'), buyMoney: $('buy-money'), buyRows: $('buy-rows'), buyMsg: $('buy-msg'),
    grenades: $('grenades'), vignette: $('vignette'), spectate: $('spectate'),
  };
  let last = {};
  let hitTimer = 0;
  function setText(node, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    node.textContent = value;
  }
  // Buy menu rows, built once from the config table.
  for (const row of BUY_ROWS) {
    const div = document.createElement('div');
    div.className = 'buy-row';
    let label;
    let price;
    if (row.id === 'grenade') { label = 'Popper — frag grenade'; price = CONFIG.grenade.price; }
    else if (row.id === 'kit') { label = 'Defuse Kit — defuse in 2.5 s'; price = CONFIG.defuseKit.price; }
    else { const w = CONFIG.weapons[row.id]; label = `${w.name} — ${w.damage} dmg, ${w.mag}/${w.reserve}`; price = w.price; }
    div.innerHTML = `<span class="buy-key">${row.key}</span><span class="buy-label">${label}</span><span class="buy-price">$${price}</span>`;
    div.addEventListener('click', () => onBuy(row.id));
    el.buyRows.appendChild(div);
  }
  return {
    setHealth(hp) {
      setText(el.health, 'hp', String(Math.max(0, Math.ceil(hp))));
      const pct = Math.max(0, Math.min(100, hp));
      if (last.hpPct !== pct) { last.hpPct = pct; el.healthBar.style.width = `${pct}%`; }
    },
    setAmmo(mag, reserve, name, grenades) {
      setText(el.ammoMag, 'mag', String(mag));
      setText(el.ammoReserve, 'res', `/ ${reserve}`);
      setText(el.weaponName, 'wname', name);
      setText(el.grenades, 'nade', grenades > 0 ? `◉ ${grenades}` : '○ 0');
      el.ammo.classList.toggle('empty', mag === 0);
    },
    setMoney(m) { setText(el.money, 'money', `$${m}`); },
    setTimer(seconds, planted, fuse) {
      const text = planted ? `CHARGE ${clock(fuse)}` : clock(seconds);
      setText(el.timer, 'timer', text);
      el.timer.classList.toggle('urgent', (!planted && seconds < 10) || (planted && fuse < 10));
    },
    setScore(e, a) { setText(el.score, 'score', `EMBER ${e} — ${a} ASH`); },
    setPips(emberAlive, ashAlive) {
      const key = `${emberAlive}${ashAlive}`;
      if (last.pips === key) return;
      last.pips = key;
      el.pipsEmber.textContent = '●'.repeat(emberAlive) + '○'.repeat(5 - emberAlive);
      el.pipsAsh.textContent = '●'.repeat(ashAlive) + '○'.repeat(5 - ashAlive);
    },
    setBombLine(text) { setText(el.bombLine, 'bomb', text); },
    setHint(text) { setText(el.hint, 'hint', text); },
    setFeed(feed, now) {
      const lines = feed.filter((f) => now - f.at < 5).map((f) => f.text).join('\n');
      setText(el.feed, 'feed', lines);
    },
    setCrosshair(spreadPx) {
      const gap = Math.round(4 + spreadPx * 900);
      if (last.gap === gap) return;
      last.gap = gap;
      el.crosshair.style.setProperty('--gap', `${gap}px`);
    },
    hitMarker(killed, holdMs = 90) {
      el.hitmarker.classList.add('on');
      el.hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => el.hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      el.vignette.classList.add('on');
      setTimeout(() => el.vignette.classList.remove('on'), 180);
    },
    showBanner(text) {
      el.bannerText.textContent = text;
      el.banner.hidden = false;
    },
    hideBanner() { el.banner.hidden = true; },
    showBuy(money, weaponId) {
      el.buy.hidden = false;
      setText(el.buyMoney, 'buymoney', `Your money: $${money}`);
      [...el.buyRows.children].forEach((row, i) => row.classList.toggle('owned', BUY_ROWS[i].id === weaponId));
    },
    hideBuy() { el.buy.hidden = true; },
    buyMessage(text) { setText(el.buyMsg, 'buymsg', text); },
    setSpectate(text) {
      setText(el.spectate, 'spec', text);
      el.spectate.hidden = !text;
    },
    showOverlay(mode, detail = '') {
      const text = COPY[mode];
      el.title.textContent = text.title;
      el.copy.textContent = detail || text.copy;
      el.play.textContent = text.action;
      el.play.style.display = text.action ? '' : 'none';
      el.overlay.hidden = false;
      if (text.action) el.play.focus();
    },
    hideOverlay() { el.overlay.hidden = true; },
    onPlay(handler) { el.play.addEventListener('click', handler); },
  };
}
