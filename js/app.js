/* HOLODORI SIM - 静的サイト本体（外部送信なし / localStorageのみ） */
(function () {
  'use strict';

  const LS = {
    owned: 'holodori_owned_v3',
    team: 'holodori_team_v3',
    board: 'holodori_board_v3',
    settings: 'holodori_settings_v3',
    compare: 'holodori_compare_v3'
  };
  const IMPORT_MAX = 1500000;

  let APP = null;
  let CARDS = [];
  let CARD_MAP = {};
  let UNIQUE_MEMBERS = [];
  let SONGS = [];
  let HOLOMEM_RANK = {};

  let owned = [];
  let team = { leader: null, members: [null, null, null, null, null] };
  let boardProgress = {};
  let compareList = [];
  let settings = { bloom2: 5, bloom5: 5, levelRef: 80, useLocalImages: false };

  let modalCardId = null;
  let modalBloom = 0;
  let modalTrain = 0;
  let editOwnedId = null;
  let pickingSlot = null;
  let boardFocusName = '';
  let deferredInstall = null;

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = String(msg);
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }
  function loadJSON(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      if (!v) return fallback;
      if (v.length > IMPORT_MAX) return fallback;
      return JSON.parse(v);
    } catch (e) {
      console.warn('load failed', key, e);
      return fallback;
    }
  }
  function saveJSON(key, val) {
    try {
      const s = JSON.stringify(val);
      if (s.length > IMPORT_MAX) {
        toast('保存データが大きすぎます');
        return false;
      }
      localStorage.setItem(key, s);
      return true;
    } catch (e) {
      toast('保存に失敗しました（容量不足の可能性）');
      return false;
    }
  }
  function typeBadgeClass(t) {
    return t === 'ハッピー' ? 'b-happy' : t === 'ピュア' ? 'b-pure' : 'b-cute';
  }
  function trainCap(train) { return 40 + (train | 0) * 10; }
  function clampNum(n, min, max) {
    n = Number(n);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }
  function isPlainObject(x) {
    return !!x && typeof x === 'object' && !Array.isArray(x);
  }

  function bloomMult(bloom, rarity) {
    let m = 1;
    if ((bloom | 0) >= 2) m += (Number(settings.bloom2) || 0) / 100;
    if ((bloom | 0) >= 5 && (rarity | 0) === 3) m += (Number(settings.bloom5) || 0) / 100;
    return m;
  }
  function getBaseStats(cardId) {
    const c = CARD_MAP[cardId];
    return c && c.stats ? c.stats : null;
  }
  function calcStatsAtLevel(cardId, level, trainLv, bloom) {
    const max = getBaseStats(cardId);
    const c = CARD_MAP[cardId];
    if (!max || !c) return null;
    const ratio = Math.min(Math.max(level, 1) / (Number(settings.levelRef) || 80), 1);
    const bm = bloomMult(bloom, c.rarity);
    const r = (v) => Math.round(v * ratio * bm);
    return { total: r(max.total), perf: r(max.perf), tech: r(max.tech), sense: r(max.sense), ratio, bloomMult: bm };
  }
  function globalGreenBonusPct() {
    let pct = 0;
    Object.keys(boardProgress).forEach((name) => {
      const p = boardProgress[name];
      if (!p) return;
      // 緑は編成外でも常時・全員パラメータUP（全ホロメン合算）
      pct += Number(p.greenPct) || 0;
    });
    return pct;
  }
  function boardBonusForName(name, role) {
    const p = boardProgress[name] || {};
    let pct = globalGreenBonusPct();
    // 黄はソロ楽曲スコア等のため編成パラメータには入れない
    if (role === 'leader') pct += Number(p.redPct) || 0;
    if (role === 'member') pct += Number(p.bluePct) || 0;
    if (role === 'any') pct = globalGreenBonusPct();
    return pct / 100;
  }
  /** 黄マス（楽曲/サポート）ボーナス。編成パラメータとは別表示用 */
  function yellowSongBonusPct(name) {
    const p = boardProgress[name] || {};
    return Number(p.yellowPct) || 0;
  }
  function calcOwnedStats(o, role) {
    const st = calcStatsAtLevel(o.cardId, o.level, o.train, o.bloom);
    if (!st) return null;
    const c = CARD_MAP[o.cardId];
    const bonus = boardBonusForName(c.name, role || 'any');
    const m = 1 + bonus;
    return {
      total: Math.round(st.total * m),
      perf: Math.round(st.perf * m),
      tech: Math.round(st.tech * m),
      sense: Math.round(st.sense * m),
      boardBonus: bonus,
      bloomMult: st.bloomMult
    };
  }

  /** スキル条件用のタグ・タイプ名をそろえる */
  function normalizeGroupName(name) {
    let g = String(name || '').trim();
    if (!g) return '';
    g = g.replace(/タイプ$/, '');
    if (g === 'ReGOSS') g = 'ReGLOSS';
    return g;
  }
  function cardGroups(card) {
    const tags = String(card.tag || '').split(/[,、]/).map((s) => normalizeGroupName(s)).filter(Boolean);
    const type = normalizeGroupName(card.type || '');
    const set = new Set(tags);
    if (type) set.add(type);
    return set;
  }
  function countGroupsInTeam(cards) {
    const counts = {};
    cards.forEach((c) => {
      cardGroups(c).forEach((g) => { counts[g] = (counts[g] || 0) + 1; });
    });
    return counts;
  }

  /**
   * 衣装/パッシブ文言からシナジー効果を抽出（概算）
   * 例: 「Promise2人以上で全員の全パラメータが50%UP」
   *     「キュートタイプ2人のセンスが41%UP」
   *     「ピュアタイプ2人のスコアサポート11%」
   */
  function parseSkillEffects(text) {
    const t = String(text || '');
    const effects = [];
    if (!t) return effects;
    const group = '(?:ID[123]期生|[0-5]期生|Advent|Myth|Promise|ReGOSS|ReGLOSS|holoX|ゲーマーズ|ハッピータイプ|ピュアタイプ|キュートタイプ|ハッピー|ピュア|キュート)';
    // 「スコアサポート効果?」だと「効」必須になり「スコアサポート11%」を取りこぼす → (?:効果)?
    const stat = '(?:全パラメータ|パフォーマンス|テクニック|センス|スコアサポート(?:効果)?)';
    const re = new RegExp(
      `(?:(${group})が?)?(\\d+)人(?:以上)?(?:で)?(?:(${group})(\\d+)人(?:以上)?の)?(全員|自身)?(?:の)?(${stat})\\s*が?\\s*(\\d+(?:\\.\\d+)?)\\s*%(?:UP|アップ)?`,
      'gi'
    );
    const covered = []; // 条件付きで取った範囲（全員〜の二重計上防止）
    let m;
    while ((m = re.exec(t)) !== null) {
      covered.push([m.index, m.index + m[0].length]);
      const condGroup = normalizeGroupName(m[1] || '');
      const condCount = Number(m[2] || 0);
      const targetGroup = normalizeGroupName(m[3] || '');
      const targetCount = Number(m[4] || 0);
      const scope = m[5] || '';
      const statName = m[6] || '';
      const pct = Number(m[7] || 0);
      if (!statName || !pct) continue;
      let needGroup = condGroup;
      let needCount = condCount;
      let applyTo = 'team';
      let applyGroup = '';
      if (targetGroup) {
        needGroup = needGroup || targetGroup;
        needCount = needCount || condCount || targetCount || 2;
        applyTo = 'group';
        applyGroup = targetGroup;
      } else if (!scope && needGroup) {
        // 「0期生2人のセンスが43%UP」→ そのグループに適用
        applyTo = 'group';
        applyGroup = needGroup;
        needCount = needCount || 2;
      } else if (scope === '自身') {
        applyTo = 'self';
      } else {
        applyTo = 'team';
      }
      const atLeast = /以上/.test(m[0]) || !!needGroup;
      effects.push({
        needGroup, needCount: needCount || 0, atLeast,
        applyTo, applyGroup, stat: statName, pct,
        raw: m[0]
      });
    }
    // 条件なし「全員の〜」「自身の〜」（条件付きマッチと重なる場合はスキップ）
    const rePlain = new RegExp(`(全員|自身)の(${stat})\\s*が?\\s*(\\d+(?:\\.\\d+)?)\\s*%(?:UP|アップ)?`, 'gi');
    while ((m = rePlain.exec(t)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (covered.some(([a, b]) => start >= a && end <= b)) continue;
      // 直前に「N人」があるなら条件付き側の一部
      const before = t.slice(Math.max(0, start - 28), start);
      if (/\d+人/.test(before)) continue;
      const pct = Number(m[3] || 0);
      const statName = m[2];
      if (!pct) continue;
      const dup = effects.some((e) => e.stat === statName && e.pct === pct && !e.needGroup && e.applyTo === (m[1] === '自身' ? 'self' : 'team'));
      if (dup) continue;
      effects.push({
        needGroup: '', needCount: 0, atLeast: true,
        applyTo: m[1] === '自身' ? 'self' : 'team',
        applyGroup: '',
        stat: statName,
        pct,
        raw: m[0]
      });
    }
    return effects;
  }

  /** 旧API互換: 衣装スキルの簡易倍率 */
  function parseCostumeSkill(text) {
    const effects = parseSkillEffects(text);
    const out = { all: 0, perf: 0, tech: 0, sense: 0, scoreSupport: 0, note: String(text || ''), effects };
    effects.forEach((e) => {
      if (e.applyTo !== 'team' && e.applyTo !== 'group') return;
      if (e.needGroup) return; // 条件付きは estimate 側で判定
      if (e.stat.includes('全パラメータ')) out.all += e.pct;
      else if (e.stat.includes('パフォーマンス')) out.perf += e.pct;
      else if (e.stat.includes('テクニック')) out.tech += e.pct;
      else if (e.stat.includes('センス')) out.sense += e.pct;
      else if (e.stat.includes('スコアサポート')) out.scoreSupport += e.pct;
    });
    return out;
  }

  function applyEffectToMult(mult, effect, active) {
    if (!active) return;
    const p = effect.pct / 100;
    if (effect.stat.includes('全パラメータ')) {
      mult.all += p; return;
    }
    if (effect.stat.includes('パフォーマンス')) { mult.perf += p; return; }
    if (effect.stat.includes('テクニック')) { mult.tech += p; return; }
    if (effect.stat.includes('センス')) { mult.sense += p; return; }
    if (effect.stat.includes('スコアサポート')) { mult.scoreSupport += p; }
  }

  function effectIsActive(effect, groupCounts) {
    if (!effect.needGroup || !effect.needCount) return true;
    const n = groupCounts[effect.needGroup] || 0;
    return effect.atLeast ? n >= effect.needCount : n === effect.needCount || n >= effect.needCount;
  }

  function estimateScore(teamObj) {
    const slots = [
      { ownedId: teamObj.leader, role: 'leader' },
      ...teamObj.members.map((id) => ({ ownedId: id, role: 'member' }))
    ];
    const entries = [];
    slots.forEach((s) => {
      if (!s.ownedId) return;
      const o = owned.find((x) => x.ownedId === s.ownedId);
      if (!o) return;
      const c = CARD_MAP[o.cardId];
      const st = calcOwnedStats(o, s.role);
      if (!st) return;
      entries.push({ o, c, st, role: s.role, isLeader: s.role === 'leader' });
    });
    const cards = entries.map((e) => e.c);
    const groupCounts = countGroupsInTeam(cards);
    const notes = [];
    const skillDetails = []; // 編成内のスキル全文＋発動状況
    const teamMult = { all: 0, perf: 0, tech: 0, sense: 0, scoreSupport: 0 };
    const selfMult = entries.map(() => ({ all: 0, perf: 0, tech: 0, sense: 0, scoreSupport: 0 }));
    const groupMult = {}; // group -> mult

    function bumpGroup(g) {
      if (!groupMult[g]) groupMult[g] = { all: 0, perf: 0, tech: 0, sense: 0, scoreSupport: 0 };
      return groupMult[g];
    }

    function describeEffect(ef, ok) {
      const cond = ef.needGroup
        ? `${ef.needGroup}${ef.needCount}人${ef.atLeast ? '以上' : ''}`
        : '条件なし';
      const target = ef.applyTo === 'self' ? '自身'
        : ef.applyTo === 'group' ? `${ef.applyGroup || '?'}向け`
        : '全員';
      return `${ok ? '発動' : '未発動'}: ${cond} → ${target} ${ef.stat}+${ef.pct}%`;
    }

    function registerSkill(kind, e, text, effects, applyFn) {
      const lines = [];
      effects.forEach((ef) => {
        const ok = effectIsActive(ef, groupCounts);
        lines.push(describeEffect(ef, ok));
        if (ok) applyFn(ef);
        else if (ef.needGroup) {
          notes.push(`未発動: ${kind}/${e.c.name}（${ef.needGroup}${ef.needCount}人必要・今${groupCounts[ef.needGroup] || 0}人）`);
        }
      });
      skillDetails.push({
        role: e.isLeader ? 'リーダー' : 'メンバー',
        name: e.c.name,
        costume: e.c.costume || '',
        kind,
        text: text || '（なし）',
        lines,
        activeCount: effects.filter((ef) => effectIsActive(ef, groupCounts)).length,
        totalEffects: effects.length
      });
    }

    // リーダー衣装スキル
    const leader = entries.find((e) => e.isLeader);
    if (leader) {
      const effects = parseSkillEffects(leader.c.costume_skill);
      registerSkill('衣装', leader, leader.c.costume_skill, effects, (ef) => {
        if (ef.applyTo === 'self') applyEffectToMult(selfMult[entries.indexOf(leader)], ef, true);
        else if (ef.applyTo === 'group' && ef.applyGroup) applyEffectToMult(bumpGroup(ef.applyGroup), ef, true);
        else applyEffectToMult(teamMult, ef, true);
        notes.push(`衣装発動: ${leader.c.name} ${ef.stat}+${ef.pct}%` + (ef.needGroup ? `（${ef.needGroup}）` : ''));
      });
    }

    // 全員のパッシブ
    entries.forEach((e, idx) => {
      const effects = parseSkillEffects(e.c.passive_skill);
      registerSkill('パッシブ', e, e.c.passive_skill, effects, (ef) => {
        if (ef.applyTo === 'self') applyEffectToMult(selfMult[idx], ef, true);
        else if (ef.applyTo === 'group' && ef.applyGroup) applyEffectToMult(bumpGroup(ef.applyGroup), ef, true);
        else applyEffectToMult(teamMult, ef, true);
        if (ef.needGroup || ef.pct >= 30) {
          notes.push(`パッシブ発動: ${e.c.name} ${ef.stat}+${ef.pct}%` + (ef.needGroup ? `（${ef.needGroup}）` : ''));
        }
      });
    });

    let sum = { total: 0, perf: 0, tech: 0, sense: 0 };
    let poweredPerf = 0, poweredTech = 0, poweredSense = 0;
    let unknown = 0;
    const names = [];
    entries.forEach((e, idx) => {
      names.push(e.c.name);
      sum.total += e.st.total; sum.perf += e.st.perf; sum.tech += e.st.tech; sum.sense += e.st.sense;
      const gset = cardGroups(e.c);
      let ma = teamMult.all + selfMult[idx].all;
      let mp = teamMult.perf + selfMult[idx].perf;
      let mt = teamMult.tech + selfMult[idx].tech;
      let ms = teamMult.sense + selfMult[idx].sense;
      gset.forEach((g) => {
        const gm = groupMult[g];
        if (!gm) return;
        ma += gm.all; mp += gm.perf; mt += gm.tech; ms += gm.sense;
      });
      poweredPerf += Math.round(e.st.perf * (1 + ma + mp));
      poweredTech += Math.round(e.st.tech * (1 + ma + mt));
      poweredSense += Math.round(e.st.sense * (1 + ma + ms));
    });
    const poweredTotal = poweredPerf + poweredTech + poweredSense;
    const types = cards.map((c) => c.type);
    const typeCount = types.reduce((a, t) => { a[t] = (a[t] || 0) + 1; return a; }, {});
    const maxType = Math.max(0, ...Object.values(typeCount));
    const typeBonus = maxType >= 5 ? 1.08 : maxType >= 4 ? 1.04 : 1;
    let scoreSupport = teamMult.scoreSupport;
    Object.values(groupMult).forEach((gm) => { scoreSupport += gm.scoreSupport; });
    selfMult.forEach((sm) => { scoreSupport += sm.scoreSupport; });
    // スコアサポートは概算でスコア指数に加算（実機の厳密式ではない）
    const scoreIndex = Math.round(poweredTotal * typeBonus * (1 + scoreSupport * 0.35));
    // タグの主な固まり
    const topTag = Object.entries(groupCounts)
      .filter(([g]) => !['ハッピー', 'ピュア', 'キュート'].includes(g))
      .sort((a, b) => b[1] - a[1])[0];
    if (topTag && topTag[1] >= 2) notes.push(`ユニット寄せ: ${topTag[0]}×${topTag[1]}`);
    if (maxType >= 3) notes.push(`タイプ寄せ: ${Object.entries(typeCount).sort((a,b)=>b[1]-a[1])[0][0]}×${maxType}`);
    if (scoreSupport > 0) notes.push(`スコアサポート合計 +${Math.round(scoreSupport * 1000) / 10}%換算`);

    // 人数カウント表示用
    const groupSummary = Object.entries(groupCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([g, n]) => `${g}×${n}`)
      .slice(0, 10);

    return {
      sum,
      unknown,
      filled: entries.length,
      names,
      powered: { perf: poweredPerf, tech: poweredTech, sense: poweredSense, total: poweredTotal },
      leaderSkill: leader ? parseCostumeSkill(leader.c.costume_skill) : { all: 0, perf: 0, tech: 0, sense: 0, note: '' },
      typeBonus,
      scoreSupport,
      groupCounts,
      groupSummary,
      synergyNotes: notes,
      skillDetails,
      scoreIndex
    };
  }

  function sumTeamStats(teamObj) {
    const slots = [
      { ownedId: teamObj.leader, role: 'leader' },
      ...teamObj.members.map((id) => ({ ownedId: id, role: 'member' }))
    ];
    const sum = { total: 0, perf: 0, tech: 0, sense: 0 };
    let unknown = 0, filled = 0;
    const names = [];
    slots.forEach((s) => {
      if (!s.ownedId) return;
      const o = owned.find((x) => x.ownedId === s.ownedId);
      if (!o) return;
      filled++;
      const c = CARD_MAP[o.cardId];
      names.push(c.name);
      const st = calcOwnedStats(o, s.role);
      if (!st) { unknown++; return; }
      sum.total += st.total; sum.perf += st.perf; sum.tech += st.tech; sum.sense += st.sense;
    });
    return { sum, unknown, filled, names };
  }

  function validateOwnedItem(o) {
    if (!isPlainObject(o)) return null;
    if (typeof o.ownedId !== 'string' || o.ownedId.length > 64) return null;
    if (typeof o.cardId !== 'string' || !CARD_MAP[o.cardId]) return null;
    return {
      ownedId: o.ownedId,
      cardId: o.cardId,
      bloom: clampNum(o.bloom, 0, 5),
      train: clampNum(o.train, 0, 4),
      level: clampNum(o.level, 1, 120)
    };
  }
  function validateTeamObj(t) {
    if (!isPlainObject(t)) return { leader: null, members: [null, null, null, null, null] };
    const ids = new Set(owned.map((o) => o.ownedId));
    const leader = (typeof t.leader === 'string' && ids.has(t.leader)) ? t.leader : null;
    const members = Array.isArray(t.members) ? t.members.slice(0, 5) : [];
    while (members.length < 5) members.push(null);
    return {
      leader,
      members: members.map((id) => (typeof id === 'string' && ids.has(id) ? id : null))
    };
  }

  // ---- UI helpers ----
  function showTab(name) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tabpage').forEach((p) => {
      p.style.display = p.id === 'tab-' + name ? 'block' : 'none';
    });
    if (name === 'mine') renderMine();
    if (name === 'team') { renderTeam(); renderCompare(); renderScoreBox(); }
    if (name === 'songs') renderSongs();
    if (name === 'board') renderBoard();
    if (name === 'settings') renderSettings();
    if (name === 'data') renderDataStats();
  }

  function localImageCandidates(cardId) {
    const id = String(cardId || '');
    return [`images/${id}.webp`, `images/${id}.png`, `images/${id}.jpg`, `images/${id}.jpeg`];
  }

  /**
   * 公式絵は同梱しない／他サイト転載もしない／偽サムネも出さない。
   * 設定ONかつ images/{id}.* があるときだけ表示。
   */
  function thumbHtml(card) {
    if (!settings.useLocalImages) return '';
    const first = localImageCandidates(card.id)[0];
    const alt = `${card.name || ''} ${card.costume || ''}`.trim();
    return `<img class="thumb" data-card-thumb="${esc(card.id)}" src="${esc(first)}" alt="${esc(alt)}" width="72" height="96" loading="lazy" decoding="async">`;
  }

  function bindThumbFallbacks(root) {
    (root || document).querySelectorAll('img[data-card-thumb]').forEach((img) => {
      if (img.dataset.bound) return;
      img.dataset.bound = '1';
      img.dataset.tryIndex = '0';
      const tryNext = () => {
        const id = img.getAttribute('data-card-thumb');
        const list = localImageCandidates(id);
        let i = Number(img.dataset.tryIndex || 0) + 1;
        if (i < list.length) {
          img.dataset.tryIndex = String(i);
          img.src = list[i];
          return;
        }
        img.remove();
      };
      img.addEventListener('error', tryNext);
      if (img.complete && img.naturalWidth === 0) tryNext();
    });
  }

  function skillsHtml(card, compact) {
    const rows = [];
    if (card.special_skill) rows.push(`<div><b>SP</b> ${esc(card.special_skill)}</div>`);
    if (card.active_skill) rows.push(`<div><b>アクティブ</b> ${esc(card.active_skill)}</div>`);
    if (card.passive_skill) rows.push(`<div><b>パッシブ</b> ${esc(card.passive_skill)}</div>`);
    if (card.costume_skill) rows.push(`<div><b>衣装</b> ${esc(card.costume_skill)}</div>`);
    if (card.connect) rows.push(`<div><b>コネクト</b> ${esc(card.connect)}</div>`);
    if (!rows.length) return '<div class="skill-box">スキル情報なし</div>';
    if (compact) {
      return `<details class="skill-details">
        <summary>スキルを見る</summary>
        <div class="skill-box compact">${rows.join('')}</div>
      </details>`;
    }
    return `<div class="skill-box">${rows.join('')}</div>`;
  }

  function ownedCountByCardId(cardId) {
    return owned.filter((o) => o.cardId === cardId).length;
  }

  function holomemRank(name) {
    return Object.prototype.hasOwnProperty.call(HOLOMEM_RANK, name)
      ? HOLOMEM_RANK[name]
      : 9999;
  }

  function sortCardsForRegister(list, key) {
    const k = key || 'rarity';
    return list.slice().sort((a, b) => {
      if (k === 'holomem') {
        const d = holomemRank(a.name) - holomemRank(b.name);
        if (d !== 0) return d;
        if (b.rarity !== a.rarity) return b.rarity - a.rarity;
        return a.costume.localeCompare(b.costume, 'ja');
      }
      if (k === 'perf' || k === 'tech' || k === 'sense') {
        const av = (a.stats && a.stats[k]) || 0;
        const bv = (b.stats && b.stats[k]) || 0;
        if (bv !== av) return bv - av;
        return holomemRank(a.name) - holomemRank(b.name);
      }
      // rarity（デフォルト）: レア高 → ホロメン順 → 衣装
      if (b.rarity !== a.rarity) return b.rarity - a.rarity;
      const d = holomemRank(a.name) - holomemRank(b.name);
      if (d !== 0) return d;
      return a.costume.localeCompare(b.costume, 'ja');
    });
  }

  function renderSearch() {
    const q = document.getElementById('searchInput').value.trim();
    const rarity = document.getElementById('filterRarity').value;
    const type = document.getElementById('filterType').value;
    const sortKey = document.getElementById('sortRegister').value;
    const filtered = CARDS.filter((c) => {
      if (q && !(c.name.includes(q) || c.costume.includes(q) || (c.tag || '').includes(q))) return false;
      if (rarity && String(c.rarity) !== rarity) return false;
      if (type && c.type !== type) return false;
      return true;
    });
    const list = sortCardsForRegister(filtered, sortKey);
    const box = document.getElementById('searchList');
    if (!list.length) { box.innerHTML = '<div class="empty">該当カードなし</div>'; return; }
    box.innerHTML = list.map((c) => {
      const st = c.stats;
      const cnt = ownedCountByCardId(c.id);
      const isOwned = cnt > 0;
      const statLine = st
        ? `P ${st.perf.toLocaleString()} / T ${st.tech.toLocaleString()} / S ${st.sense.toLocaleString()}（合計 ${st.total.toLocaleString()}）`
        : 'ステータスなし';
      return `<div class="card-item ${isOwned ? 'owned' : ''}">
        ${thumbHtml(c)}
        <div class="info" style="min-width:0;flex:1;">
          <div class="name">${esc(c.name)}</div>
          <div class="costume">${esc(c.costume)}</div>
          <div class="tags">
            <span class="badge b-star">★${c.rarity}</span>
            <span class="badge ${typeBadgeClass(c.type)}">${esc(c.type)}</span>
            <span class="badge b-dim">${esc(c.tag)}</span>
            ${isOwned ? `<span class="badge b-owned">登録済み×${cnt}</span>` : ''}
          </div>
          <div class="costume">${statLine}</div>
          ${skillsHtml(c, true)}
        </div>
        <div class="row" style="flex-direction:column;align-items:flex-end;gap:6px;">
          <button class="small ${isOwned ? 'ghost' : ''}" data-action="open-register" data-card-id="${esc(c.id)}" type="button">${isOwned ? '追加登録' : '登録'}</button>
        </div>
      </div>`;
    }).join('');
    bindThumbFallbacks(box);
  }

  function openRegister(cardId, ownedId) {
    modalCardId = cardId; editOwnedId = ownedId || null;
    const c = CARD_MAP[cardId];
    if (!c) return;
    const existing = ownedId ? owned.find((o) => o.ownedId === ownedId) : null;
    modalBloom = existing ? existing.bloom : 0;
    modalTrain = existing ? existing.train : 0;
    document.getElementById('regTitle').textContent = `${c.name}（${c.costume}）`;
    document.getElementById('regBadges').innerHTML =
      `<span class="badge b-star">★${c.rarity}</span><span class="badge ${typeBadgeClass(c.type)}">${esc(c.type)}</span><span class="badge b-dim">${esc(c.tag)}</span>`;
    const skillHost = document.getElementById('regSkills');
    if (skillHost) skillHost.innerHTML = skillsHtml(c, false);
    document.getElementById('stepBloom').innerHTML = [0, 1, 2, 3, 4, 5].map((n) =>
      `<button type="button" data-action="set-bloom" data-v="${n}" class="${n === modalBloom ? 'active' : ''}">${n}</button>`).join('');
    document.getElementById('stepTrain').innerHTML = [0, 1, 2, 3, 4].map((n) =>
      `<button type="button" data-action="set-train" data-v="${n}" class="${n === modalTrain ? 'active' : ''}">${n}</button>`).join('');
    const range = document.getElementById('lvRange');
    range.value = existing ? existing.level : trainCap(modalTrain);
    updateLevelCap();
    document.getElementById('regModal').classList.add('show');
  }
  function updateLevelCap() {
    const cap = trainCap(modalTrain);
    document.getElementById('lvCap').textContent = String(cap);
    const range = document.getElementById('lvRange');
    range.max = String(cap);
    if (+range.value > cap) range.value = String(cap);
    document.getElementById('lvVal').textContent = range.value;
    updateStatsBox();
  }
  function updateStatsBox() {
    const level = +document.getElementById('lvRange').value;
    const st = calcStatsAtLevel(modalCardId, level, modalTrain, modalBloom);
    const box = document.getElementById('statPreview');
    if (!st) { box.innerHTML = '<div class="warnbox">ステータスがありません</div>'; return; }
    box.innerHTML = `
      <div class="stat-box"><div class="v">${st.total.toLocaleString()}</div><div class="l">トータル</div></div>
      <div class="stat-box"><div class="v">${st.perf.toLocaleString()}</div><div class="l">パフォーマンス</div></div>
      <div class="stat-box"><div class="v">${st.tech.toLocaleString()}</div><div class="l">テクニック</div></div>
      <div class="stat-box"><div class="v">${st.sense.toLocaleString()}</div><div class="l">センス</div></div>`;
  }
  function saveOwned() {
    try {
      const level = +document.getElementById('lvRange').value;
      if (editOwnedId) {
        const o = owned.find((x) => x.ownedId === editOwnedId);
        if (o) { o.bloom = modalBloom; o.train = modalTrain; o.level = level; }
      } else {
        owned.push({
          ownedId: 'o' + Date.now() + Math.random().toString(16).slice(2, 6),
          cardId: modalCardId, bloom: modalBloom, train: modalTrain, level
        });
      }
      saveJSON(LS.owned, owned);
      document.getElementById('regModal').classList.remove('show');
      toast(editOwnedId ? '更新しました' : '登録しました');
      renderSearch();
      renderMine();
    } catch (e) {
      toast('登録に失敗: ' + e.message);
    }
  }

  function renderMine() {
    document.getElementById('mineCount').textContent = `（${owned.length}枚）`;
    const sortKey = document.getElementById('sortMine').value;
    let list = owned.map((o) => {
      const c = CARD_MAP[o.cardId];
      const st = calcOwnedStats(o, 'any');
      return { o, c, st };
    }).filter((x) => x.c);
    list.sort((a, b) => {
      if (sortKey === 'level') {
        if (b.o.level !== a.o.level) return b.o.level - a.o.level;
        return holomemRank(a.c.name) - holomemRank(b.c.name);
      }
      if (sortKey === 'rarity') {
        if (b.c.rarity !== a.c.rarity) return b.c.rarity - a.c.rarity;
        return holomemRank(a.c.name) - holomemRank(b.c.name);
      }
      if (sortKey === 'holomem') {
        const d = holomemRank(a.c.name) - holomemRank(b.c.name);
        if (d !== 0) return d;
        return b.c.rarity - a.c.rarity;
      }
      if (sortKey === 'perf' || sortKey === 'tech' || sortKey === 'sense') {
        const av = (a.st && a.st[sortKey]) || -1;
        const bv = (b.st && b.st[sortKey]) || -1;
        if (bv !== av) return bv - av;
        return holomemRank(a.c.name) - holomemRank(b.c.name);
      }
      return 0;
    });
    const box = document.getElementById('mineList');
    if (!list.length) {
      box.innerHTML = '<div class="empty">まだありません。「①登録」から追加してください。</div>';
      return;
    }
    box.innerHTML = list.map(({ o, c, st }) => `
      <div class="card-item">
        ${thumbHtml(c)}
        <div class="info" style="min-width:0;flex:1;">
          <div class="name">${esc(c.name)}（${esc(c.costume)}）</div>
          <div class="tags">
            <span class="badge b-star">★${c.rarity}</span>
            <span class="badge ${typeBadgeClass(c.type)}">${esc(c.type)}</span>
            <span class="badge b-dim">凸${o.bloom} / 特訓${o.train} / Lv${o.level}</span>
          </div>
          <div class="costume">${st
            ? `P ${st.perf.toLocaleString()} / T ${st.tech.toLocaleString()} / S ${st.sense.toLocaleString()}（合計 ${st.total.toLocaleString()}）`
            : '計算不可'}</div>
          ${skillsHtml(c, true)}
        </div>
        <div class="row" style="flex-direction:column;align-items:flex-end;gap:6px;">
          <div class="row">
            <button class="small ghost" type="button" data-action="edit-owned" data-card-id="${esc(c.id)}" data-owned-id="${esc(o.ownedId)}">編集</button>
            <button class="small danger" type="button" data-action="remove-owned" data-owned-id="${esc(o.ownedId)}">削除</button>
          </div>
        </div>
      </div>`).join('');
    bindThumbFallbacks(box);
  }

  function renderTeam() {
    const grid = document.getElementById('teamGrid');
    const slots = [{ key: 'leader', label: 'リーダー' }, 0, 1, 2, 3, 4].map((s) =>
      typeof s === 'object' ? s : { key: s, label: `枠${s + 1}` });
    grid.innerHTML = slots.map((s) => {
      const ownedId = s.key === 'leader' ? team.leader : team.members[s.key];
      const o = owned.find((x) => x.ownedId === ownedId);
      if (!o) {
        return `<div class="team-slot ${s.key === 'leader' ? 'leader' : ''}" data-action="pick-slot" data-slot="${esc(String(s.key))}">${esc(s.label)}<br>未選択</div>`;
      }
      const c = CARD_MAP[o.cardId];
      const st = calcOwnedStats(o, s.key === 'leader' ? 'leader' : 'member');
      return `<div class="team-slot filled ${s.key === 'leader' ? 'leader' : ''}" data-action="pick-slot" data-slot="${esc(String(s.key))}">
        ${thumbHtml(c)}
        <b>${esc(s.label)}</b><span>${esc(c.name)}</span>
        <span style="font-size:.62rem;color:var(--muted);">★${c.rarity} Lv${o.level} 凸${o.bloom}</span>
        <span style="font-size:.62rem;">${st ? st.total.toLocaleString() : '-'}</span>
      </div>`;
    }).join('');
    bindThumbFallbacks(grid);
    renderTeamSum();
    renderScoreBox();
  }
  function renderTeamSum() {
    const { sum, unknown, filled } = sumTeamStats(team);
    document.getElementById('teamSum').innerHTML = `
      <div class="stat-box"><div class="v">${sum.total.toLocaleString()}</div><div class="l">合計トータル（${filled}/6）</div></div>
      <div class="stat-box"><div class="v">${sum.perf.toLocaleString()}</div><div class="l">合計パフォーマンス</div></div>
      <div class="stat-box"><div class="v">${sum.tech.toLocaleString()}</div><div class="l">合計テクニック</div></div>
      <div class="stat-box"><div class="v">${sum.sense.toLocaleString()}</div><div class="l">合計センス</div></div>
    ` + (unknown ? '<div class="warnbox" style="grid-column:1/-1;">計算できないカードがあります</div>' : '');
  }
  function renderScoreBox() {
    const el = document.getElementById('scoreBox');
    if (!el) return;
    if (!team.leader || team.members.some((x) => !x)) {
      el.innerHTML = '<div class="hint">リーダーと5枠を埋めると、スキルシナジー込みのスコア概算が出ます。</div>';
      return;
    }
    const est = estimateScore(team);
    el.innerHTML = `
      <div class="secbox">
        <b>スコア概算インデックス</b>：${est.scoreIndex.toLocaleString()}
        （ステ＋衣装／パッシブ条件＋タイプ寄せの非公式指標です。実スコアそのものではありません）<br>
        衣装スキル：${esc(est.leaderSkill.note || 'なし')}<br>
        タイプ統一補正：×${est.typeBonus.toFixed(2)}
      </div>
      ${synergyNotesHtml(est)}
      ${skillsDetailHtml(est)}
      <div class="stat-grid cols4">
        <div class="stat-box"><div class="v">${est.powered.total.toLocaleString()}</div><div class="l">スキル後ステ合計</div></div>
        <div class="stat-box"><div class="v">${est.powered.perf.toLocaleString()}</div><div class="l">Perf反映後</div></div>
        <div class="stat-box"><div class="v">${est.powered.tech.toLocaleString()}</div><div class="l">Tech反映後</div></div>
        <div class="stat-box"><div class="v">${est.powered.sense.toLocaleString()}</div><div class="l">Sense反映後</div></div>
      </div>`;
  }

  function pickSlot(key) {
    if (!owned.length) { toast('先に所持カードを登録してください'); return; }
    pickingSlot = key;
    document.getElementById('pickTitle').textContent = key === 'leader' ? 'リーダーを選ぶ' : `枠${(+key) + 1}を選ぶ`;
    document.getElementById('pickSearch').value = '';
    renderPickList();
    document.getElementById('pickModal').classList.add('show');
  }
  function renderPickList() {
    const q = (document.getElementById('pickSearch').value || '').trim();
    const used = new Set([team.leader, ...team.members].filter(Boolean));
    if (pickingSlot === 'leader' && team.leader) used.delete(team.leader);
    if (pickingSlot !== 'leader' && team.members[pickingSlot]) used.delete(team.members[pickingSlot]);
    let list = owned.map((o) => ({ o, c: CARD_MAP[o.cardId], st: calcOwnedStats(o, 'any') })).filter((x) => x.c);
    if (q) list = list.filter((x) => x.c.name.includes(q) || x.c.costume.includes(q));
    list.sort((a, b) => (b.st ? b.st.total : 0) - (a.st ? a.st.total : 0));
    const box = document.getElementById('pickList');
    box.innerHTML = list.map(({ o, c, st }) => {
      const busy = used.has(o.ownedId);
      return `<div class="card-item" style="opacity:${busy ? .5 : 1}">
        ${thumbHtml(c)}
        <div class="info" style="flex:1;min-width:0;">
          <div class="name">${esc(c.name)}（${esc(c.costume)}）</div>
          <div class="costume">★${c.rarity} / 凸${o.bloom} / Lv${o.level} / ${st ? st.total.toLocaleString() : '-'}</div>
          ${busy ? '<div class="costume">※この所持カードは別枠で使用中</div>' : ''}
        </div>
        <button class="small" type="button" data-action="choose-owned" data-owned-id="${esc(o.ownedId)}" ${busy ? 'disabled' : ''}>選択</button>
      </div>`;
    }).join('') || '<div class="empty">候補がありません</div>';
    bindThumbFallbacks(box);
  }
  function chooseOwned(ownedId) {
    if (pickingSlot === 'leader') team.leader = ownedId;
    else team.members[pickingSlot] = ownedId;
    saveJSON(LS.team, team);
    document.getElementById('pickModal').classList.remove('show');
    pickingSlot = null;
    renderTeam();
    toast('セットしました');
  }
  function applyTeam(t) {
    team = { leader: t.leader, members: t.members.slice() };
    saveJSON(LS.team, team);
    renderTeam();
  }
  function teamLabel(teamObj) {
    return [teamObj.leader, ...teamObj.members].filter(Boolean).map((id) => {
      const o = owned.find((x) => x.ownedId === id);
      return o ? CARD_MAP[o.cardId].name : '?';
    }).join(' / ');
  }
  /** リーダー＋メンバー集合が同じなら同一編成（メンバー順の違いは無視） */
  function teamFingerprint(teamObj) {
    const leader = teamObj.leader || '';
    const members = (teamObj.members || []).filter(Boolean).slice().sort().join(',');
    return `${leader}|${members}`;
  }
  function cleanCandidateLabel(label) {
    return String(label || '').replace(/\s*#\d+\s*$/, '').trim();
  }
  function formatMergedLabels(labels) {
    const uniq = [];
    (labels || []).forEach((lb) => {
      const c = cleanCandidateLabel(lb);
      if (c && !uniq.includes(c)) uniq.push(c);
    });
    if (!uniq.length) return '候補';
    if (uniq.length === 1) return uniq[0];
    if (uniq.length === 2) return `${uniq[0]} ＋ ${uniq[1]}（同率）`;
    return `${uniq.join(' ＋ ')}（同率）`;
  }
  /** リーダーを色分けして表示 */
  function teamRosterHtml(teamObj) {
    const leaderO = owned.find((x) => x.ownedId === teamObj.leader);
    const leaderName = leaderO ? CARD_MAP[leaderO.cardId].name : '？';
    const members = (teamObj.members || []).filter(Boolean).map((id) => {
      const o = owned.find((x) => x.ownedId === id);
      return o ? CARD_MAP[o.cardId].name : '？';
    });
    return `<div class="roster">
      <div class="roster-leader"><span class="leader-tag">リーダー</span><span class="leader-name">${esc(leaderName)}</span></div>
      <div class="roster-members"><span class="member-tag">メンバー</span>${members.map((n) => `<span class="member-name">${esc(n)}</span>`).join('<span class="sep"> / </span>')}</div>
    </div>`;
  }
  /** 候補リストを同一編成でマージ */
  function mergeCandidateRows(rows) {
    const map = new Map();
    rows.forEach((r) => {
      if (!r || !r.t) return;
      const key = teamFingerprint(r.t);
      if (map.has(key)) {
        const cur = map.get(key);
        const lb = cleanCandidateLabel(r.label || (r.labels && r.labels[0]) || '');
        if (lb && !cur.labels.includes(lb)) cur.labels.push(lb);
      } else {
        const labels = [];
        if (Array.isArray(r.labels)) r.labels.forEach((x) => {
          const c = cleanCandidateLabel(x);
          if (c && !labels.includes(c)) labels.push(c);
        });
        else {
          const c = cleanCandidateLabel(r.label || '');
          if (c) labels.push(c);
        }
        map.set(key, {
          labels,
          t: r.t,
          est: r.est || estimateScore(r.t),
          key
        });
      }
    });
    return [...map.values()].sort((a, b) => b.est.scoreIndex - a.est.scoreIndex);
  }
  function scoreOwned(o, goal) {
    const st = calcOwnedStats(o, 'any');
    if (!st) return -1;
    const c = CARD_MAP[o.cardId];
    if (goal === 'perf') return st.perf;
    if (goal === 'tech') return st.tech;
    if (goal === 'sense') return st.sense;
    if (goal === 'happy') return c.type === 'ハッピー' ? st.total + 5000 : st.total * 0.2;
    if (goal === 'pure') return c.type === 'ピュア' ? st.total + 5000 : st.total * 0.2;
    if (goal === 'cute') return c.type === 'キュート' ? st.total + 5000 : st.total * 0.2;
    if (goal === 'score') {
      const skill = parseCostumeSkill(c.costume_skill);
      const pass = parseSkillEffects(c.passive_skill);
      const tagBias = pass.some((e) => e.needGroup) ? 800 : 0;
      return st.total + (skill.all + skill.perf + skill.tech + skill.sense) * 40
        + (skill.scoreSupport || 0) * 50 + c.rarity * 200 + tagBias;
    }
    return st.total;
  }

  /** 部分編成を評価（シナジー込み） */
  function scoreTeamObj(teamObj, goal) {
    const est = estimateScore(teamObj);
    if (goal === 'total') return est.sum.total;
    if (goal === 'perf') return est.powered.perf;
    if (goal === 'tech') return est.powered.tech;
    if (goal === 'sense') return est.powered.sense;
    if (goal === 'happy' || goal === 'pure' || goal === 'cute') {
      const want = goal === 'happy' ? 'ハッピー' : goal === 'pure' ? 'ピュア' : 'キュート';
      const n = [teamObj.leader, ...teamObj.members].filter(Boolean).reduce((acc, id) => {
        const o = owned.find((x) => x.ownedId === id);
        return acc + (o && CARD_MAP[o.cardId].type === want ? 1 : 0);
      }, 0);
      return est.scoreIndex + n * 50000;
    }
    return est.scoreIndex;
  }

  function preferredGroupsFromCard(card) {
    const effects = [...parseSkillEffects(card.costume_skill), ...parseSkillEffects(card.passive_skill)];
    const pref = [];
    effects.forEach((e) => {
      if (e.needGroup) pref.push(e.needGroup);
      if (e.applyGroup) pref.push(e.applyGroup);
    });
    cardGroups(card).forEach((g) => {
      if (!['ハッピー', 'ピュア', 'キュート'].includes(g)) pref.push(g);
    });
    return [...new Set(pref)];
  }

  /** 所持カードから狙えるユニット／タイプタグ一覧 */
  function ownedSynergyGroups() {
    const counts = {};
    owned.forEach((o) => {
      const c = CARD_MAP[o.cardId];
      if (!c) return;
      cardGroups(c).forEach((g) => { counts[g] = (counts[g] || 0) + 1; });
      preferredGroupsFromCard(c).forEach((g) => { counts[g] = counts[g] || 0; });
    });
    return Object.entries(counts)
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => g);
  }

  function buildTeamAroundLeader(leader, goal, opts) {
    const preferGroup = (opts && opts.preferGroup) || '';
    const used = new Set([leader.ownedId]);
    const members = [];
    const leaderCard = CARD_MAP[leader.cardId];
    const prefs = preferredGroupsFromCard(leaderCard);
    if (preferGroup && !prefs.includes(preferGroup)) prefs.unshift(preferGroup);

    while (members.length < 5) {
      let best = null;
      let bestScore = -Infinity;
      for (const o of owned) {
        if (used.has(o.ownedId)) continue;
        const trialMembers = members.concat([o.ownedId]);
        while (trialMembers.length < 5) trialMembers.push(null);
        const trial = { leader: leader.ownedId, members: trialMembers.slice(0, 5) };
        let s = scoreTeamObj(trial, goal);
        const c = CARD_MAP[o.cardId];
        const gset = cardGroups(c);
        prefs.forEach((p) => { if (gset.has(p)) s += 18000; });
        // 指定ユニット寄せをさらに強く
        if (preferGroup && gset.has(preferGroup)) s += 35000;
        // パッシブ条件を満たしにいくボーナス
        preferredGroupsFromCard(c).forEach((p) => {
          if (gset.has(p) || prefs.includes(p)) s += 4000;
        });
        if (s > bestScore) { bestScore = s; best = o; }
      }
      if (!best) break;
      used.add(best.ownedId);
      members.push(best.ownedId);
    }
    if (members.length < 5) return null;
    return { leader: leader.ownedId, members };
  }

  function buildBestTeam(goal) {
    if (owned.length < 6) return null;
    const results = collectDiverseTeams(goal, 1);
    return results.length ? results[0].t : null;
  }

  /**
   * 所持内からできるだけ多くの異なる組み合わせを探索
   * （リーダー差・ユニット寄せ差を広く拾う）
   */
  function collectDiverseTeams(goal, limit) {
    const out = [];
    const seen = new Set();
    const lim = Math.max(1, limit || 12);

    function add(t, label) {
      if (!t || !t.leader) return;
      const key = teamFingerprint(t);
      if (seen.has(key)) return;
      seen.add(key);
      const est = estimateScore(t);
      out.push({ label, t, est });
    }

    if (owned.length < 6) return out;

    const ranked = owned.slice().sort((a, b) => scoreOwned(b, goal) - scoreOwned(a, goal));
    const leaders = ranked.slice().sort((a, b) => {
      const ca = CARD_MAP[a.cardId], cb = CARD_MAP[b.cardId];
      const sa = scoreOwned(a, goal) + (ca.costume_skill ? 3000 : 0) + ca.rarity * 150
        + preferredGroupsFromCard(ca).length * 400;
      const sb = scoreOwned(b, goal) + (cb.costume_skill ? 3000 : 0) + cb.rarity * 150
        + preferredGroupsFromCard(cb).length * 400;
      return sb - sa;
    });

    // 1) 有力リーダーを広く試す
    const tryLeaders = leaders.slice(0, Math.min(36, leaders.length));
    for (const leader of tryLeaders) {
      const name = CARD_MAP[leader.cardId].name;
      add(buildTeamAroundLeader(leader, goal), `リーダー:${name}`);
    }

    // 2) 所持で2人以上いるタグごとに寄せ編成
    for (const g of ownedSynergyGroups().slice(0, 14)) {
      const gLeaders = leaders.filter((o) => {
        const c = CARD_MAP[o.cardId];
        return cardGroups(c).has(g) || preferredGroupsFromCard(c).includes(g);
      }).slice(0, 6);
      for (const leader of gLeaders) {
        add(buildTeamAroundLeader(leader, goal, { preferGroup: g }), `${g}寄せ`);
      }
    }

    out.sort((a, b) => b.est.scoreIndex - a.est.scoreIndex);
    return out.slice(0, lim);
  }

  function synergyNotesHtml(est) {
    const notes = (est.synergyNotes || []).slice(0, 14);
    const groups = (est.groupSummary || []).join(' / ');
    const head = groups
      ? `<div class="hint">編成内カウント: ${esc(groups)}</div>`
      : '';
    if (!notes.length) {
      return head + '<div class="hint">シナジー特記なし（ステータス中心の編成）</div>';
    }
    return head + `<div class="hint">シナジー: ${notes.map((n) => esc(n)).join(' ／ ')}</div>`;
  }

  /** 衣装・パッシブ全文と発動／未発動（常時表示） */
  function skillsDetailHtml(est) {
    const details = est.skillDetails || [];
    if (!details.length) return '';
    return `<div class="skill-panel">
      <div class="sec" style="font-size:.85rem;margin-top:10px;">スキル内容（衣装・パッシブ／発動判定つき）</div>
      ${details.map((d) => `
        <div class="skill-box ${d.kind === '衣装' ? 'skill-costume' : 'skill-passive'}">
          <b>${esc(d.role)} ${esc(d.name)}</b>
          ${d.costume ? `<span class="chip">${esc(d.costume)}</span>` : ''}
          <div><b>${esc(d.kind)}</b>：${esc(d.text)}</div>
          ${d.lines.length
            ? d.lines.map((line) => {
                const ok = line.startsWith('発動');
                return `<div class="${ok ? 'skill-on' : 'skill-off'}">${esc(line)}</div>`;
              }).join('')
            : '<div>数値効果を文言から抽出できませんでした（表示のみ）</div>'}
        </div>`).join('')}
      <div class="hint">※％はカードテキスト準拠の概算です。実機のスコア式・同時発動上限は非公開のため完全一致ではありません。</div>
    </div>`;
  }

  function candidateCardHtml(r, i) {
    const title = formatMergedLabels(r.labels || [r.label]);
    return `<div class="candidate">
        <h4>#${i + 1} ${esc(title)} — スコア概算 ${r.est.scoreIndex.toLocaleString()}</h4>
        ${teamRosterHtml(r.t)}
        ${synergyNotesHtml(r.est)}
        <div class="stat-grid cols4" style="margin:8px 0;">
          <div class="stat-box"><div class="v">${r.est.sum.total.toLocaleString()}</div><div class="l">総合力 Total</div></div>
          <div class="stat-box"><div class="v">${r.est.powered.total.toLocaleString()}</div><div class="l">スキル後</div></div>
          <div class="stat-box"><div class="v">${r.est.sum.perf.toLocaleString()}</div><div class="l">Perf</div></div>
          <div class="stat-box"><div class="v">${r.est.sum.sense.toLocaleString()}</div><div class="l">Sense</div></div>
        </div>
        ${skillsDetailHtml(r.est)}
        <div class="row">
          <button class="small" type="button" data-action="apply-json" data-json="${esc(JSON.stringify(r.t))}">この編成を使う</button>
          <button class="small ghost" type="button" data-action="compare-add-json" data-json="${esc(JSON.stringify(r.t))}">比較に追加</button>
        </div>
      </div>`;
  }

  function runAutoTeam() {
    const goal = document.getElementById('autoGoal').value;
    const box = document.getElementById('autoResult');
    box.innerHTML = '<div class="hint">所持カードの組み合わせを探索中…（少し待つことがあります）</div>';
    toast('自動編成を探索中…');
    setTimeout(() => {
      try {
        const list = mergeCandidateRows(collectDiverseTeams(goal, 12));
        if (!list.length) {
          box.innerHTML = '<div class="warnbox">自動編成には所持カードが6枚以上必要です。</div>';
          return;
        }
        const best = list[0];
        applyTeam(best.t);
        box.innerHTML = `<div class="okbox">スキルシナジー込みで自動編成しました。<br>
      合計 ${best.est.sum.total.toLocaleString()} / スコア概算 ${best.est.scoreIndex.toLocaleString()}
      </div>
      ${teamRosterHtml(best.t)}
      ${synergyNotesHtml(best.est)}
      ${skillsDetailHtml(best.est)}
      <div class="hint" style="margin-top:10px;">同じ目標の別候補（上位・重複まとめ済み）</div>
      ${list.slice(1).map((r, i) => candidateCardHtml(r, i + 1)).join('')}
      <button class="small" type="button" data-action="compare-add-json" data-json="${esc(JSON.stringify(best.t))}">最上位を比較リストに追加</button>`;
        toast('シナジー込み自動編成 完了');
      } catch (err) {
        console.error(err);
        box.innerHTML = `<div class="warnbox">自動編成に失敗しました: ${esc(err.message)}</div>`;
        toast('自動編成に失敗');
      }
    }, 30);
  }

  function runCandidates() {
    const box = document.getElementById('candidateList');
    box.innerHTML = '<div class="hint">候補をたくさん生成中…（所持が多いと数秒かかることがあります）</div>';
    toast('候補を生成中…');
    setTimeout(() => {
      try {
        const goals = [
          ['score', 'スコア（シナジー）'], ['total', '総合力'], ['perf', 'パフォーマンス'], ['tech', 'テクニック'], ['sense', 'センス'],
          ['happy', 'ハッピー寄せ'], ['pure', 'ピュア寄せ'], ['cute', 'キュート寄せ']
        ];
        const raw = [];
        for (const [goal, label] of goals) {
          collectDiverseTeams(goal, 6).forEach((r) => {
            raw.push({ label, t: r.t, est: r.est });
          });
        }
        for (const g of ownedSynergyGroups().slice(0, 12)) {
          const leaders = owned.filter((o) => cardGroups(CARD_MAP[o.cardId]).has(g))
            .sort((a, b) => scoreOwned(b, 'score') - scoreOwned(a, 'score'))
            .slice(0, 10);
          for (const leader of leaders) {
            const t = buildTeamAroundLeader(leader, 'score', { preferGroup: g });
            if (t) raw.push({ label: `${g}寄せ`, t, est: estimateScore(t) });
          }
        }

        const top = mergeCandidateRows(raw).slice(0, 16);
        if (!top.length) {
          box.innerHTML = '<div class="warnbox">候補を作れません。所持を増やしてください。</div>';
          return;
        }
        box.innerHTML = `<div class="okbox">所持カードから ${top.length} 通り（同じメンバー構成は「同率」でまとめ済み）。</div>`
          + top.map((r, i) => candidateCardHtml(r, i)).join('');
        toast(`${top.length}件のシナジー候補を生成`);
      } catch (err) {
        console.error(err);
        box.innerHTML = `<div class="warnbox">候補生成に失敗しました: ${esc(err.message)}</div>`;
        toast('候補生成に失敗');
      }
    }, 30);
  }
  function saveTeamObjToCompare(t) {
    const copy = { leader: t.leader, members: t.members.slice(), savedAt: Date.now() };
    compareList = [copy, ...compareList].slice(0, 3);
    saveJSON(LS.compare, compareList);
    renderCompare();
    toast('比較リストに追加（最大3）');
  }
  function renderCompare() {
    const box = document.getElementById('compareGrid');
    if (!compareList.length) { box.innerHTML = '<div class="empty">まだ比較用の編成がありません</div>'; return; }
    box.innerHTML = compareList.map((t, idx) => {
      const est = estimateScore(t);
      return `<div class="candidate">
        <h4>編成 ${idx + 1}</h4>
        ${teamRosterHtml(t)}
        ${synergyNotesHtml(est)}
        <div class="stat-grid" style="margin-top:8px;">
          <div class="stat-box"><div class="v">${est.scoreIndex.toLocaleString()}</div><div class="l">スコア概算</div></div>
          <div class="stat-box"><div class="v">${est.sum.total.toLocaleString()}</div><div class="l">総合力</div></div>
          <div class="stat-box"><div class="v">${est.sum.perf.toLocaleString()}</div><div class="l">Perf</div></div>
          <div class="stat-box"><div class="v">${est.sum.sense.toLocaleString()}</div><div class="l">Sense</div></div>
        </div>
        ${skillsDetailHtml(est)}
        <div class="row" style="margin-top:8px;">
          <button class="small" type="button" data-action="apply-json" data-json="${esc(JSON.stringify(t))}">適用</button>
          <button class="small danger" type="button" data-action="compare-remove" data-idx="${idx}">外す</button>
        </div>
      </div>`;
    }).join('');
  }

  // ---- Songs ----
  function renderSongs() {
    const q = (document.getElementById('songSearch').value || '').trim();
    const box = document.getElementById('songList');
    const list = SONGS.filter((s) => !q || s.name.includes(q) || (s.member || '').includes(q) || (s.note || '').includes(q));
    box.innerHTML = list.map((s) => {
      const yPct = s.member ? yellowSongBonusPct(s.member) : 0;
      return `
      <div class="candidate">
        <h4>${esc(s.name)}</h4>
        <div class="hint">${esc(s.note || '')} ${s.member ? `/ 関連：${esc(s.member)}` : ''}</div>
        <div class="tags" style="margin:6px 0;">
          <span class="badge b-dim">推奨ステ：${esc(s.focusStat)}</span>
          ${s.focusType ? `<span class="badge ${typeBadgeClass(s.focusType)}">${esc(s.focusType)}</span>` : ''}
          ${(s.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}
          ${s.member && yPct > 0 ? `<span class="chip">黄ボード +${yPct}%（楽曲用）</span>` : ''}
        </div>
        <button class="small" type="button" data-action="song-team" data-song-id="${esc(s.id)}">この曲向けに自動編成</button>
      </div>`;
    }).join('') || '<div class="empty">曲が見つかりません</div>';
  }
  function buildSongTeam(songId) {
    const song = SONGS.find((s) => s.id === songId);
    if (!song) return;
    let goal = song.focusStat === 'perf' || song.focusStat === 'tech' || song.focusStat === 'sense'
      ? song.focusStat : 'score';
    if (song.focusType === 'ハッピー') goal = 'happy';
    if (song.focusType === 'ピュア') goal = 'pure';
    if (song.focusType === 'キュート') goal = 'cute';
    // 関連メンバーがいればそのメンバーをリーダーにしてシナジー込みで組む
    let t = buildBestTeam(goal);
    if (song.member && owned.length >= 6) {
      const leaderCand = owned
        .filter((o) => CARD_MAP[o.cardId].name === song.member)
        .sort((a, b) => scoreOwned(b, goal) - scoreOwned(a, goal))[0];
      if (leaderCand) {
        const syn = buildTeamAroundLeader(leaderCand, goal);
        if (syn) t = syn;
      }
    }
    const out = document.getElementById('songResult');
    if (!t) {
      out.innerHTML = '<div class="warnbox">所持が足りません（カードが6枚以上必要）</div>';
      return;
    }
    applyTeam(t);
    const est = estimateScore(t);
    out.innerHTML = `<div class="okbox">「${esc(song.name)}」向け編成を適用しました。<br>スコア概算 ${est.scoreIndex.toLocaleString()}</div>
      ${teamRosterHtml(t)}
      ${synergyNotesHtml(est)}
      ${skillsDetailHtml(est)}`;
    toast('曲向け編成を適用');
    showTab('team');
  }

  // ---- ホロメンボード（任意・みんな登録で正確化） ----
  // 全キャラ正確なマス図データは未公開のため、推測図は出さない。
  // 実機を見た人が効果%・メモを登録し、JSON共有で広げる方式。
  function parseConnectText(text) {
    const t = String(text || '');
    const mCells = t.match(/(\d+)\s*マス/);
    const mPct = t.match(/(\d+(?:\.\d+)?)\s*%/);
    return {
      cells: mCells ? Number(mCells[1]) : 0,
      pct: mPct ? Number(mPct[1]) : 0,
      raw: t
    };
  }
  function defaultBoardObj() {
    return {
      usage: 'leader',
      red: 0, blue: 0, green: 0, yellow: 0,
      redPct: 0, bluePct: 0, greenPct: 0, yellowPct: 0,
      connectCardId: '',
      connectNote: '',
      memo: '',
      layoutNote: '',
      verified: false,
      updatedAt: ''
    };
  }
  function ensureBoard(name) {
    if (!boardProgress[name] || typeof boardProgress[name] !== 'object') {
      boardProgress[name] = defaultBoardObj();
    }
    const p = boardProgress[name];
    // 旧・推測レイアウト由来フィールドは使わない（%などは引き継ぐ）
    delete p.cells;
    delete p.layoutId;
    delete p.connectFocus;
    delete p.cellBase;
    delete p.autoCalc;
    if (!p.usage) p.usage = 'leader';
    if (p.yellowPct === undefined) p.yellowPct = 0;
    if (p.layoutNote === undefined) p.layoutNote = '';
    if (p.verified === undefined) p.verified = false;
    return p;
  }
  function sanitizeBoardEntry(raw) {
    if (!isPlainObject(raw)) return null;
    const p = defaultBoardObj();
    p.usage = ['leader', 'member', 'support'].includes(raw.usage) ? raw.usage : 'leader';
    p.red = clampNum(raw.red, 0, 99);
    p.blue = clampNum(raw.blue, 0, 99);
    p.green = clampNum(raw.green, 0, 99);
    p.yellow = clampNum(raw.yellow, 0, 99);
    p.redPct = clampNum(raw.redPct, 0, 999);
    p.bluePct = clampNum(raw.bluePct, 0, 999);
    p.greenPct = clampNum(raw.greenPct, 0, 999);
    p.yellowPct = clampNum(raw.yellowPct, 0, 999);
    p.connectCardId = typeof raw.connectCardId === 'string' ? raw.connectCardId.slice(0, 32) : '';
    p.connectNote = String(raw.connectNote || '').slice(0, 200);
    p.memo = String(raw.memo || '').slice(0, 200);
    p.layoutNote = String(raw.layoutNote || '').slice(0, 500);
    p.verified = !!raw.verified;
    p.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt.slice(0, 40) : '';
    return p;
  }
  function usedConnectCardMap() {
    const map = {};
    Object.keys(boardProgress).forEach((name) => {
      const id = boardProgress[name] && boardProgress[name].connectCardId;
      if (id) map[id] = name;
    });
    return map;
  }
  function connectCandidates(forName) {
    const used = usedConnectCardMap();
    return owned
      .map((o) => {
        const c = CARD_MAP[o.cardId];
        if (!c || c.rarity < 4 || !c.connect) return null;
        const owner = used[c.id];
        if (owner && owner !== forName) return null;
        return { owned: o, card: c };
      })
      .filter(Boolean)
      .sort((a, b) => b.card.rarity - a.card.rarity || a.card.name.localeCompare(b.card.name, 'ja'));
  }
  function boardRegisteredCount() {
    return Object.keys(boardProgress).filter((n) => {
      const p = boardProgress[n];
      if (!p) return false;
      return (Number(p.redPct) || 0) + (Number(p.bluePct) || 0) + (Number(p.greenPct) || 0) + (Number(p.yellowPct) || 0) > 0
        || p.connectCardId || p.memo || p.layoutNote || p.verified;
    }).length;
  }
  function exportBoardShare() {
    const boards = {};
    Object.keys(boardProgress).forEach((name) => {
      const clean = sanitizeBoardEntry(boardProgress[name]);
      if (!clean) return;
      // 空データは共有しない
      const has = clean.redPct || clean.bluePct || clean.greenPct || clean.yellowPct
        || clean.connectCardId || clean.memo || clean.layoutNote || clean.verified
        || clean.red || clean.blue || clean.green || clean.yellow;
      if (!has) return;
      boards[name] = clean;
    });
    const data = {
      type: 'holodori_board_share',
      version: 1,
      exportedAt: new Date().toISOString(),
      note: 'みんなで実機を見て登録したボード共有データ。推測マス図は含みません。',
      boards
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'holodori_board_share.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`ボード共有データを書き出し（${Object.keys(boards).length}人）`);
  }
  function importBoardShareObject(data, mode) {
    if (!isPlainObject(data)) throw new Error('JSONの形式が不正です');
    let boards = data.boards;
    if (!boards && isPlainObject(data.boardProgress)) boards = data.boardProgress;
    if (!isPlainObject(boards)) throw new Error('boards がありません');
    const next = mode === 'replace' ? {} : Object.assign({}, boardProgress);
    let n = 0;
    Object.keys(boards).forEach((name) => {
      if (typeof name !== 'string' || name.length > 64) return;
      if (!UNIQUE_MEMBERS.includes(name) && !(APP.members || []).includes(name)) {
        // 未知名もメモ用に許可（長さ制限内）
      }
      const clean = sanitizeBoardEntry(boards[name]);
      if (!clean) return;
      next[name] = clean;
      n++;
    });
    boardProgress = next;
    saveJSON(LS.board, boardProgress);
    return n;
  }
  function renderBoard() {
    const guide = APP.boardGuide || {};
    document.getElementById('boardGuideBox').innerHTML =
      Object.entries(guide).map(([k, v]) => `<div><b>${esc(k)}</b>：${esc(v)}</div>`).join('') +
      `<div class="hint" style="margin-top:8px;">登録済み（入力あり）: ${boardRegisteredCount()}人 / 確認済み: ${
        Object.keys(boardProgress).filter((n) => boardProgress[n] && boardProgress[n].verified).length
      }人。友達の JSON を読み込むとデータが増えます（サーバには送りません）。</div>`;
    const q = (document.getElementById('boardSearch').value || '').trim();
    const names = UNIQUE_MEMBERS.filter((n) => !q || n.includes(q));
    if (!boardFocusName || !names.includes(boardFocusName)) boardFocusName = names[0] || '';
    const sel = document.getElementById('boardMemberSelect');
    sel.innerHTML = names.map((n) => {
      const p = boardProgress[n];
      const mark = p && p.verified ? '✓' : (p && ((p.redPct || p.bluePct || p.greenPct || p.yellowPct)) ? '・' : '');
      return `<option value="${esc(n)}" ${n === boardFocusName ? 'selected' : ''}>${mark}${esc(n)}</option>`;
    }).join('');
    const list = document.getElementById('boardList');
    if (!boardFocusName) { list.innerHTML = '<div class="empty">ホロメンがいません</div>'; return; }
    const p = ensureBoard(boardFocusName);
    const safe = encodeURIComponent(boardFocusName);
    const cands = connectCandidates(boardFocusName);
    const card = p.connectCardId ? CARD_MAP[p.connectCardId] : null;
    const parsed = parseConnectText(card ? card.connect : p.connectNote);
    const connectLabel = card
      ? `★${card.rarity} ${card.name}／${card.costume}（${parsed.cells || '?'}マス・${parsed.pct || '?'}%UP）`
      : (p.connectNote || '未設置');
    const tip = p.usage === 'leader' ? '実機では赤（リーダー）マスを優先して解放するのがおすすめです。'
      : p.usage === 'member' ? '実機では青（メンバー）マスを優先して解放するのがおすすめです。'
      : '実機では緑・黄（サポート）マスを優先して解放するのがおすすめです。';
    list.innerHTML = `
      <div class="board-card">
        <div class="name" style="font-weight:900;margin-bottom:8px;">${esc(boardFocusName)} のボード登録</div>
        <div class="warnbox" style="margin-bottom:10px;">
          マス配置の正確な全データは未公開のため、<b>推測のマス図は出しません</b>。<br>
          実機ルールの要点：隣接マスから順に解放／先の区画はドリームランクで開く／リセット可（ゲーム内はホロゴールド）。<br>
          ゲーム画面を見ながら効果％やメモを登録してください。友達とJSONを共有すると、みんなで正確な情報に育てられます。
        </div>
        <label class="field">用途（攻略のおすすめ優先色）</label>
        <select data-action="board-field" data-name="${safe}" data-field="usage">
          <option value="leader" ${p.usage === 'leader' ? 'selected' : ''}>リーダー向け（赤優先）</option>
          <option value="member" ${p.usage === 'member' ? 'selected' : ''}>メンバー向け（青優先）</option>
          <option value="support" ${p.usage === 'support' ? 'selected' : ''}>サポート向け（緑・黄優先）</option>
        </select>
        <p class="hint">${esc(tip)}</p>
        <div class="board-colors" style="margin-top:12px;">
          <div class="color-box red"><label>赤%（リーダー時）</label><input type="number" min="0" step="0.1" value="${p.redPct || 0}" data-action="board-field" data-name="${safe}" data-field="redPct"></div>
          <div class="color-box blue"><label>青%（メンバー時）</label><input type="number" min="0" step="0.1" value="${p.bluePct || 0}" data-action="board-field" data-name="${safe}" data-field="bluePct"></div>
          <div class="color-box green"><label>緑%（常時・全員合算）</label><input type="number" min="0" step="0.1" value="${p.greenPct || 0}" data-action="board-field" data-name="${safe}" data-field="greenPct"></div>
          <div class="color-box yellow"><label>黄%（楽曲用・編成P外）</label><input type="number" min="0" step="0.1" value="${p.yellowPct || 0}" data-action="board-field" data-name="${safe}" data-field="yellowPct"></div>
        </div>
        <div class="board-colors" style="margin-top:8px;">
          <div class="color-box red"><label>赤 解放マス数（任意）</label><input type="number" min="0" step="1" value="${p.red || 0}" data-action="board-field" data-name="${safe}" data-field="red"></div>
          <div class="color-box blue"><label>青 解放マス数（任意）</label><input type="number" min="0" step="1" value="${p.blue || 0}" data-action="board-field" data-name="${safe}" data-field="blue"></div>
          <div class="color-box green"><label>緑 解放マス数（任意）</label><input type="number" min="0" step="1" value="${p.green || 0}" data-action="board-field" data-name="${safe}" data-field="green"></div>
          <div class="color-box yellow"><label>黄 解放マス数（任意）</label><input type="number" min="0" step="1" value="${p.yellow || 0}" data-action="board-field" data-name="${safe}" data-field="yellow"></div>
        </div>
        <h3 class="sec" style="margin-top:14px;font-size:.95rem;">コネクト（★4以上・他ボードと排他）</h3>
        <select id="connectSelect" data-action="board-field" data-name="${safe}" data-field="connectCardId">
          <option value="">（なし）</option>
          ${cands.map(({ card: c }) =>
            `<option value="${esc(c.id)}" ${p.connectCardId === c.id ? 'selected' : ''}>★${c.rarity} ${esc(c.name)}／${esc(c.costume)}｜${esc(c.connect || '')}</option>`
          ).join('')}
        </select>
        <div class="hint">現在：${esc(connectLabel)}</div>
        <label class="field">実機で見た配置メモ（青は左？緑の位置など）</label>
        <textarea style="width:100%;min-height:64px" maxlength="500" placeholder="例：青は右側、赤は上、緑は左下…（自由記述）" data-action="board-field" data-name="${safe}" data-field="layoutNote">${esc(p.layoutNote || '')}</textarea>
        <label class="field">その他メモ</label>
        <input type="text" style="width:100%" value="${esc(p.memo || '')}" maxlength="200" placeholder="スコアサポート、ホロメンスキルなど" data-action="board-field" data-name="${safe}" data-field="memo">
        <label class="field" style="display:flex;align-items:center;gap:8px;margin-top:10px;">
          <input type="checkbox" data-action="board-field" data-name="${safe}" data-field="verified" ${p.verified ? 'checked' : ''}>
          実機で数値・配置を確認した（✓マーク）
        </label>
        <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn ghost" data-action="reset-board" data-name="${safe}">このホロメンの登録を消す</button>
          <button type="button" class="btn" data-action="export-board-share">ボード共有JSONを書き出し</button>
          <button type="button" class="btn alt" data-action="import-board-share">ボード共有JSONを読み込み</button>
        </div>
        <div class="okbox" style="margin-top:10px;">
          編成への反映：赤＝リーダー時 / 青＝メンバー時 / 緑＝全員常時合算 / 黄＝楽曲表示のみ<br>
          最終更新：${esc(p.updatedAt || '未保存の変更は入力時に自動保存')}
        </div>
      </div>`;
  }

  // ---- Settings / Data / CSV ----
  function renderSettings() {
    document.getElementById('bloom2').value = settings.bloom2;
    document.getElementById('bloom5').value = settings.bloom5;
    document.getElementById('levelRef').value = settings.levelRef;
    document.getElementById('useLocalImages').checked = !!settings.useLocalImages;
    document.getElementById('bloomStages').innerHTML = '<div class="okbox">' +
      APP.bloom.stages.map((s) => `開花${s.stage}：${esc(s.effect)}`).join('<br>') +
      '<br><br>' + esc(APP.bloom.note) + '</div>';
  }
  function renderDataStats() {
    document.getElementById('dataStats').innerHTML =
      `マスターカード: ${CARDS.length}枚<br>所持登録: ${owned.length}枚 / ボード記録: ${Object.keys(boardProgress).length}人<br>楽曲サンプル: ${SONGS.length}曲<br>更新: ${esc(APP.updated)}<br>出典: ${esc(APP.source)}`;
  }
  function exportData() {
    const data = {
      owned, team, boardProgress, settings, compareList,
      exportedAt: new Date().toISOString(), appVersion: APP.version
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'holodori_mydata.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('書き出しました');
  }
  function importDataObject(data) {
    if (!isPlainObject(data)) throw new Error('JSONの形式が不正です');
    const nextOwned = Array.isArray(data.owned)
      ? data.owned.map(validateOwnedItem).filter(Boolean).slice(0, 500)
      : [];
    owned = nextOwned;
    team = validateTeamObj(data.team || {});
    boardProgress = isPlainObject(data.boardProgress) ? data.boardProgress : {};
    // board sanitize
    const cleaned = {};
    Object.keys(boardProgress).forEach((name) => {
      if (typeof name !== 'string' || name.length > 64) return;
      const entry = sanitizeBoardEntry(boardProgress[name]);
      if (entry) cleaned[name] = entry;
    });
    boardProgress = cleaned;
    if (isPlainObject(data.settings)) {
      settings.bloom2 = clampNum(data.settings.bloom2, 0, 50);
      settings.bloom5 = clampNum(data.settings.bloom5, 0, 50);
      settings.levelRef = clampNum(data.settings.levelRef, 40, 120);
      if (typeof data.settings.useLocalImages === 'boolean') {
        settings.useLocalImages = data.settings.useLocalImages;
      }
    }
    compareList = Array.isArray(data.compareList) ? data.compareList.slice(0, 3).map(validateTeamObj) : [];
    saveJSON(LS.owned, owned);
    saveJSON(LS.team, team);
    saveJSON(LS.board, boardProgress);
    saveJSON(LS.settings, settings);
    saveJSON(LS.compare, compareList);
  }
  function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else {
        if (ch === '"') q = true;
        else if (ch === ',') { out.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out;
  }
  function importCsvText(text) {
    const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new Error('CSVにデータ行がありません');
    if (lines.length > 501) throw new Error('CSV行数が多すぎます（最大500）');
    const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const idx = {
      name: header.indexOf('name') >= 0 ? header.indexOf('name') : header.indexOf('名前'),
      costume: header.indexOf('costume') >= 0 ? header.indexOf('costume') : header.indexOf('衣装'),
      rarity: header.indexOf('rarity') >= 0 ? header.indexOf('rarity') : header.indexOf('レア'),
      bloom: header.indexOf('bloom') >= 0 ? header.indexOf('bloom') : header.indexOf('凸'),
      train: header.indexOf('train') >= 0 ? header.indexOf('train') : header.indexOf('特訓'),
      level: header.indexOf('level') >= 0 ? header.indexOf('level') : header.indexOf('レベル')
    };
    if (idx.name < 0) throw new Error('CSVに name（または 名前）列が必要です');
    let added = 0, skipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const name = (cols[idx.name] || '').trim();
      const costume = idx.costume >= 0 ? (cols[idx.costume] || '').trim() : '';
      const rarity = idx.rarity >= 0 ? Number(cols[idx.rarity]) : null;
      const bloom = idx.bloom >= 0 ? clampNum(cols[idx.bloom], 0, 5) : 0;
      const train = idx.train >= 0 ? clampNum(cols[idx.train], 0, 4) : 0;
      const level = idx.level >= 0 ? clampNum(cols[idx.level], 1, 120) : trainCap(train);
      let card = CARDS.find((c) => c.name === name && (!costume || c.costume === costume) && (rarity == null || !Number.isFinite(rarity) || c.rarity === rarity));
      if (!card) card = CARDS.find((c) => c.name === name && (!costume || c.costume.includes(costume)));
      if (!card) { skipped++; continue; }
      owned.push({
        ownedId: 'o' + Date.now() + i + Math.random().toString(16).slice(2, 5),
        cardId: card.id, bloom, train, level
      });
      added++;
    }
    if (owned.length > 500) owned = owned.slice(0, 500);
    saveJSON(LS.owned, owned);
    return { added, skipped };
  }

  function downloadCsvTemplate() {
    const csv = 'name,costume,rarity,bloom,train,level\nときのそら,ひたむきに描く虹のうた,5,2,4,80\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'holodori_owned_template.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---- Events ----
  function onClick(e) {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const action = t.getAttribute('data-action');
    try {
      if (action === 'open-register') openRegister(t.getAttribute('data-card-id'));
      else if (action === 'edit-owned') openRegister(t.getAttribute('data-card-id'), t.getAttribute('data-owned-id'));
      else if (action === 'remove-owned') {
        if (!confirm('この所持カードを削除しますか？')) return;
        const id = t.getAttribute('data-owned-id');
        owned = owned.filter((o) => o.ownedId !== id);
        if (team.leader === id) team.leader = null;
        team.members = team.members.map((x) => x === id ? null : x);
        saveJSON(LS.owned, owned); saveJSON(LS.team, team);
        renderSearch(); renderMine(); renderTeam(); toast('削除しました');
      }
      else if (action === 'set-bloom') {
        modalBloom = +t.getAttribute('data-v');
        document.querySelectorAll('#stepBloom button').forEach((b) => b.classList.toggle('active', +b.getAttribute('data-v') === modalBloom));
        updateStatsBox();
      }
      else if (action === 'set-train') {
        modalTrain = +t.getAttribute('data-v');
        document.querySelectorAll('#stepTrain button').forEach((b) => b.classList.toggle('active', +b.getAttribute('data-v') === modalTrain));
        updateLevelCap();
      }
      else if (action === 'close-reg') document.getElementById('regModal').classList.remove('show');
      else if (action === 'save-owned') saveOwned();
      else if (action === 'pick-slot') pickSlot(t.getAttribute('data-slot'));
      else if (action === 'choose-owned') chooseOwned(t.getAttribute('data-owned-id'));
      else if (action === 'clear-pick') {
        if (pickingSlot === 'leader') team.leader = null;
        else team.members[pickingSlot] = null;
        saveJSON(LS.team, team);
        document.getElementById('pickModal').classList.remove('show');
        pickingSlot = null; renderTeam();
      }
      else if (action === 'close-pick') {
        document.getElementById('pickModal').classList.remove('show');
        pickingSlot = null;
      }
      else if (action === 'clear-team') {
        team = { leader: null, members: [null, null, null, null, null] };
        saveJSON(LS.team, team); renderTeam(); toast('クリアしました');
      }
      else if (action === 'compare-current') {
        if (!team.leader || team.members.some((x) => !x)) { toast('リーダーと5枠を埋めてから追加してください'); return; }
        saveTeamObjToCompare(team);
      }
      else if (action === 'run-auto') runAutoTeam();
      else if (action === 'run-candidates') runCandidates();
      else if (action === 'clear-compare') { compareList = []; saveJSON(LS.compare, compareList); renderCompare(); }
      else if (action === 'compare-remove') {
        compareList.splice(+t.getAttribute('data-idx'), 1);
        saveJSON(LS.compare, compareList); renderCompare();
      }
      else if (action === 'apply-json' || action === 'compare-add-json') {
        const raw = t.getAttribute('data-json');
        const obj = JSON.parse(raw);
        const vt = validateTeamObj(obj);
        if (action === 'apply-json') { applyTeam(vt); toast('適用しました'); }
        else saveTeamObjToCompare(vt);
      }
      else if (action === 'song-team') buildSongTeam(t.getAttribute('data-song-id'));
      else if (action === 'reset-board') {
        const name = decodeURIComponent(t.getAttribute('data-name'));
        if (!confirm(name + ' のボード登録を消しますか？')) return;
        delete boardProgress[name];
        saveJSON(LS.board, boardProgress);
        toast('ボード登録を消しました');
        renderBoard();
      }
      else if (action === 'export-board-share') exportBoardShare();
      else if (action === 'import-board-share') {
        const inp = document.getElementById('importBoardShareFile');
        if (inp) inp.click();
      }
      else if (action === 'save-settings') {
        settings.bloom2 = clampNum(document.getElementById('bloom2').value, 0, 50);
        settings.bloom5 = clampNum(document.getElementById('bloom5').value, 0, 50);
        settings.levelRef = clampNum(document.getElementById('levelRef').value, 40, 120);
        settings.useLocalImages = !!document.getElementById('useLocalImages').checked;
        saveJSON(LS.settings, settings);
        toast('設定を保存しました');
        renderSearch(); renderMine(); renderTeam();
      }
      else if (action === 'export-json') exportData();
      else if (action === 'csv-template') downloadCsvTemplate();
      else if (action === 'reset-all') {
        if (!confirm('所持・編成・ボード・設定を全部消します。よろしいですか？')) return;
        owned = []; team = { leader: null, members: [null, null, null, null, null] };
        boardProgress = {}; compareList = [];
        settings = { bloom2: APP.bloom.defaultBonusPctAt2, bloom5: APP.bloom.defaultBonusPctAt5Star3, levelRef: 80, useLocalImages: false };
        Object.values(LS).forEach((k) => localStorage.removeItem(k));
        saveJSON(LS.settings, settings);
        toast('初期化しました');
        renderMine(); renderTeam(); renderBoard(); renderDataStats();
      }
      else if (action === 'install-pwa') {
        if (deferredInstall) {
          deferredInstall.prompt();
          deferredInstall.userChoice.finally(() => {
            deferredInstall = null;
            document.getElementById('installBanner').classList.remove('show');
          });
        } else {
          toast('ブラウザの「ホーム画面に追加」から追加できます');
        }
      }
      else if (action === 'dismiss-install') document.getElementById('installBanner').classList.remove('show');
    } catch (err) {
      console.error(err);
      toast('操作に失敗: ' + err.message);
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.id === 'searchInput' || t.id === 'filterRarity' || t.id === 'filterType' || t.id === 'sortRegister') renderSearch();
    if (t.id === 'sortMine') renderMine();
    if (t.id === 'pickSearch') renderPickList();
    if (t.id === 'boardSearch') renderBoard();
    if (t.id === 'boardMemberSelect') { boardFocusName = t.value; renderBoard(); }
    if (t.id === 'songSearch') renderSongs();
    if (t.id === 'lvRange') {
      document.getElementById('lvVal').textContent = t.value;
      updateStatsBox();
    }
    if (t.matches('[data-action="board-field"]')) {
      const name = decodeURIComponent(t.getAttribute('data-name'));
      const field = t.getAttribute('data-field');
      const p = ensureBoard(name);
      if (field === 'memo' || field === 'connectNote') {
        p[field] = String(t.value).slice(0, 200);
      } else if (field === 'layoutNote') {
        p.layoutNote = String(t.value).slice(0, 500);
      } else if (field === 'verified') {
        p.verified = !!t.checked;
      } else if (field === 'usage') {
        p.usage = String(t.value).slice(0, 32);
      } else if (field === 'connectCardId') {
        const id = String(t.value || '');
        if (id) {
          const c = CARD_MAP[id];
          if (!c || c.rarity < 4) {
            toast('コネクトは★4以上のみです');
            t.value = p.connectCardId || '';
            return;
          }
          const used = usedConnectCardMap();
          if (used[id] && used[id] !== name) {
            toast('このカードは別ボードで使用中です');
            t.value = p.connectCardId || '';
            return;
          }
          if (!owned.some((o) => o.cardId === id)) {
            toast('所持にないカードは置けません');
            t.value = p.connectCardId || '';
            return;
          }
        }
        p.connectCardId = id;
      } else if (['red', 'blue', 'green', 'yellow'].includes(field)) {
        p[field] = clampNum(t.value, 0, 99);
      } else {
        p[field] = clampNum(t.value, 0, 999);
      }
      p.updatedAt = new Date().toISOString();
      saveJSON(LS.board, boardProgress);
      if (['usage', 'connectCardId', 'verified'].includes(field)) renderBoard();
    }
  }

  async function boot() {
    try {
      // 1) 埋め込みデータ（file:// やローカルサーバー不通時）
      // 2) なければ app_data.json を取得（GitHub Pages 等）
      if (window.__APP_DATA__ && Array.isArray(window.__APP_DATA__.cards)) {
        APP = window.__APP_DATA__;
      } else {
        const res = await fetch('app_data.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error('app_data.json を読めませんでした');
        APP = await res.json();
      }
      if (!APP || !Array.isArray(APP.cards)) throw new Error('データ形式が不正です');
      CARDS = APP.cards;
      CARD_MAP = Object.fromEntries(CARDS.map((c) => [c.id, c]));
      UNIQUE_MEMBERS = APP.members || [...new Set(CARDS.map((c) => c.name))];
      SONGS = APP.songs || [];
      HOLOMEM_RANK = {};
      (APP.holomemOrder || UNIQUE_MEMBERS).forEach((name, i) => { HOLOMEM_RANK[name] = i; });
      settings = Object.assign({
        bloom2: APP.bloom.defaultBonusPctAt2,
        bloom5: APP.bloom.defaultBonusPctAt5Star3,
        levelRef: 80,
        useLocalImages: false
      }, loadJSON(LS.settings, {}));
      owned = (loadJSON(LS.owned, []) || []).map(validateOwnedItem).filter(Boolean);
      team = validateTeamObj(loadJSON(LS.team, {}));
      boardProgress = loadJSON(LS.board, {}) || {};
      {
        const cleaned = {};
        Object.keys(boardProgress).forEach((name) => {
          if (typeof name !== 'string' || name.length > 64) return;
          const entry = sanitizeBoardEntry(boardProgress[name]);
          if (entry) cleaned[name] = entry;
        });
        boardProgress = cleaned;
      }
      compareList = (loadJSON(LS.compare, []) || []).slice(0, 3);

      // 検索エンジン向けに最初から本文を出しておく（失敗時だけ隠す）
      document.getElementById('appRoot').hidden = false;
      const bootError = document.getElementById('bootError');
      bootError.hidden = true;
      bootError.style.display = 'none';
      document.getElementById('dataVersion').textContent = `v${APP.version} / ${APP.updated}`;

      document.body.addEventListener('click', onClick);
      document.body.addEventListener('change', onChange);
      document.body.addEventListener('input', (e) => {
        if (['searchInput', 'pickSearch', 'boardSearch', 'songSearch', 'lvRange'].includes(e.target.id)) onChange(e);
      });

      document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => showTab(btn.dataset.tab));
      });
      document.querySelectorAll('#teamModes button').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#teamModes button').forEach((b) => b.classList.remove('on'));
          btn.classList.add('on');
          ['manual', 'auto', 'candidates', 'compare'].forEach((m) => {
            document.getElementById('mode-' + m).style.display = btn.dataset.mode === m ? 'block' : 'none';
          });
          if (btn.dataset.mode === 'compare') renderCompare();
        });
      });

      document.getElementById('importJsonBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
      });
      document.getElementById('importCsvBtn').addEventListener('click', () => {
        document.getElementById('importCsv').click();
      });

      document.getElementById('importFile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > IMPORT_MAX) { toast('ファイルが大きすぎます'); return; }
        try {
          const text = await file.text();
          importDataObject(JSON.parse(text));
          toast('読み込み完了');
          renderMine(); renderTeam(); renderBoard(); renderDataStats();
        } catch (err) {
          alert('読み込み失敗: ' + err.message + '\nエラー全文をコピーして相談してください。');
        }
      });
      document.getElementById('importCsv').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > IMPORT_MAX) { toast('ファイルが大きすぎます'); return; }
        try {
          const text = await file.text();
          const r = importCsvText(text);
          toast(`CSV取込: ${r.added}件追加 / ${r.skipped}件スキップ`);
          renderMine();
        } catch (err) {
          alert('CSV読込失敗: ' + err.message);
        }
      });
      document.getElementById('importBoardShareFile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > IMPORT_MAX) { toast('ファイルが大きすぎます'); return; }
        try {
          const text = await file.text();
          const obj = JSON.parse(text);
          const mode = confirm('既存のボード登録とマージしますか？\nOK＝マージ（上書き含む） / キャンセル＝読み込み中止')
            ? 'merge' : null;
          if (!mode) { toast('読み込みをやめました'); return; }
          const n = importBoardShareObject(obj, 'merge');
          toast(`ボード共有を取り込み（${n}人）`);
          renderBoard();
          renderDataStats();
        } catch (err) {
          alert('ボード共有の読込失敗: ' + err.message + '\nエラー全文をコピーして相談してください。');
        }
      });

      renderSearch();
      renderSettings();

      if ('serviceWorker' in navigator) {
        try { await navigator.serviceWorker.register('./sw.js'); } catch (_) { /* ignore */ }
      }
      window.addEventListener('beforeinstallprompt', (ev) => {
        ev.preventDefault();
        deferredInstall = ev;
        document.getElementById('installBanner').classList.add('show');
      });
    } catch (err) {
      console.error(err);
      document.getElementById('appRoot').hidden = true;
      const bootError = document.getElementById('bootError');
      bootError.hidden = false;
      bootError.style.display = 'block';
      bootError.textContent =
        'データの読み込みに失敗しました。app_data.json と同じ場所に index.html があるか確認してください。\n' + err.message;
    }
  }

  boot();
})();
