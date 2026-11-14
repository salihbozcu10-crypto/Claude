// Ekranlar: yükleme, ana menü, görev emri, ayarlar, kontroller, duraklatma, başarısızlık, görev sonu
import { saveSettings, QUALITY, DIFFICULTY } from '../config.js';
import { formatTime } from '../core/utils.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['loading', 'menu', 'brief', 'settings', 'controls', 'pause', 'dead', 'debrief'];

export class Menu {
  constructor(game) {
    this.g = game; this.current = 'loading'; this.backTo = 'menu';
    const s = game.settings;
    const on = (id, fn) => $(id).addEventListener('click', () => { game.audio.init(); game.audio.play('uiClick', { ui: true, vol: 0.7 }); fn(); });
    on('btn-start', () => this.show('brief'));
    on('btn-settings', () => this.openSub('settings', 'menu')); on('btn-controls', () => this.openSub('controls', 'menu'));
    on('btn-psettings', () => this.openSub('settings', 'pause')); on('btn-pcontrols', () => this.openSub('controls', 'pause'));
    on('btn-go', () => { s.time = $('sel-time').value; s.difficulty = $('sel-diff').value; saveSettings(s); game.startMission(); });
    on('btn-resume', () => game.resume()); on('btn-restart', () => game.startMission()); on('btn-quit', () => game.toMenu());
    on('btn-retry', () => game.startMission()); on('btn-dquit', () => game.toMenu()); on('btn-again', () => game.startMission()); on('btn-equit', () => game.toMenu());
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { game.audio.play('uiClick', { ui: true, vol: 0.7 }); this.show(b.dataset.back === 'auto' ? this.backTo : b.dataset.back); }));
    document.querySelectorAll('[data-ui="pause"]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); game.pause(); }));
    // ayar alanları
    $('sel-time').value = s.time; $('sel-diff').value = s.difficulty;
    const bind = (id, key, out, fmt, apply) => { const el = $(id); if (el.type === 'checkbox') el.checked = !!s[key]; else el.value = s[key]; const upd = () => { s[key] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? parseFloat(el.value) : el.value; if (out) $(out).textContent = fmt(s[key]); saveSettings(s); if (apply) apply(s[key]); }; el.addEventListener('input', upd); if (out) $(out).textContent = fmt(s[key]); };
    bind('set-quality', 'quality', null, null, (v) => game.applyQuality(v));
    bind('set-sens', 'sens', 'out-sens', (v) => v.toFixed(2));
    bind('set-fov', 'fov', 'out-fov', (v) => v + '°', (v) => { game.player.fovBase = v; });
    bind('set-vol', 'volume', 'out-vol', (v) => Math.round(v * 100) + '%', (v) => game.audio.setVolume(v));
    bind('set-invert', 'invertY'); bind('set-cross', 'crosshair');
  }

  show(name) {
    this.current = name;
    for (const id of SCREENS) $(id).hidden = id !== name;
    if (name === 'pause') $('pause-objs').innerHTML = this.g.hud.objectivesHTML();
    if (name) { const first = $(name)?.querySelector('.btn.primary'); if (first && !this.g.input.touch) first.focus({ preventScroll: true }); }
  }
  hide() { this.show(null); }
  openSub(name, back) { this.backTo = back; this.show(name); }
  progress(p, text) { $('load-bar').style.width = Math.round(p * 100) + '%'; if (text) $('load-text').textContent = text + '…'; }

  dead(title, text) { $('dead-title').textContent = title; $('dead-text').textContent = text; this.show('dead'); }

  debrief(st) {
    const rank = !st.spotted ? ['Hayalet', 'Kimse geldiğini görmedi. Tesis, sen vadiden ayrıldıktan sonra uyandı.'] : st.accuracy >= 45 && st.health >= 50 ? ['Profesyonel', 'Temiz ve hızlı bir iş. Hedeflerin tamamı tamamlandı.'] : ['Savaşçı', 'Sert bir çatışmanın içinden çıkıp görevi tamamladın.'];
    $('rank').textContent = rank[0]; $('rank-text').textContent = rank[1];
    const rows = [['Süre', formatTime(st.time)], ['Etkisiz düşman', st.kills], ['İsabet oranı', st.accuracy + '%'], ['Baştan vuruş', st.headshots], ['Atılan mermi', st.shots], ['Kalan sağlık', st.health + '%'], ['İkincil hedef', st.optional ? 'Tamam' : 'Yapılmadı'], ['Zorluk', DIFFICULTY[st.difficulty].label]];
    $('stats').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    this.show('debrief');
  }
}
export { QUALITY };
