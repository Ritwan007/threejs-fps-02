// The single state store. createState() builds the whole match: phases, teams,
// money, the charge, every body. Every module reads and writes through this
// object; no module keeps a duplicate copy of match state. Rendering only
// reads it; the fixed-step sim is the only writer of gameplay fields.
import { CONFIG } from './config.js';

export function createState() {
  return {
    time: 0,
    phase: 'buy', // buy | live | roundEnd | matchEnd
    phaseTime: CONFIG.match.buySeconds,
    round: 1,
    emberScore: 0,
    ashScore: 0,
    winner: null, // 'ember' | 'ash' once the match ends
    roundReason: '',
    money: CONFIG.economy.startMoney,
    kills: 0,
    deaths: 0,
    // The player is always Ember (attack). The charge starts on the player.
    player: {
      name: 'You', team: 'ember', alive: true, health: CONFIG.player.health,
      weapon: 'sidekick', mag: 12, reserve: 48, grenades: 0, hasKit: false,
      carrying: true, kills: 0,
    },
    bots: [], // filled by bots.js: {id,name,team,alive,health,weapon,skill,state,...}
    bomb: {
      carrier: 'player', planted: false, site: null, fuse: 0,
      plantProgress: 0, planting: null, defuseProgress: 0, defusing: null,
      x: 0, z: 0,
    },
    grenades: [], // live thrown grenades {x,y,z,vx,vy,vz,fuse,bounces}
    feed: [], // kill feed lines {text, at}
    events: [], // one-frame sound/hearing events {kind,x,z,at} drained by bots/audio
    spectate: null, // bot id the death camera follows
    started: false, // player has clicked play at least once
    muted: false,
  };
}

// A feed line lives 5 s; hud.js prunes by state.time.
export function pushFeed(state, text) {
  state.feed.push({ text, at: state.time });
  if (state.feed.length > 4) state.feed.shift();
}

export function pushEvent(state, kind, x, z) {
  state.events.push({ kind, x, z, at: state.time });
}
