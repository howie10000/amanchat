/* Peer-to-Peer (P2P) multiplayer for Apex Racing.
   Races run directly between players' browsers via WebRTC DataChannels (with
   BroadcastChannel local-tab support and manual SDP room codes), never through
   the game server. */
(function (root) {
  'use strict';

  const DEFAULT_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  function mulberry32(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = 'APEX-';
    for (let i = 0; i < 5; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  function encodePacket(obj) {
    const json = JSON.stringify(obj);
    if (typeof btoa === 'function') {
      return btoa(unescape(encodeURIComponent(json)));
    }
    return Buffer.from(json, 'utf8').toString('base64');
  }

  function decodePacket(str) {
    const clean = String(str || '').trim();
    if (!clean) throw new Error('Empty P2P code');
    let json;
    if (typeof atob === 'function') {
      json = decodeURIComponent(escape(atob(clean)));
    } else {
      json = Buffer.from(clean, 'base64').toString('utf8');
    }
    return JSON.parse(json);
  }

  // Deterministic track builder so every peer drives the exact same circuit.
  function buildTrackFromConfig(raceApi, config) {
    const cfg = config || {};
    const seed = (Number(cfg.seed) >>> 0) || 0x41504558;
    const rng = mulberry32(seed);
    const t = raceApi.generate(rng, {
      generation: Number(cfg.generation) || 3,
      mode: cfg.mode || 'short',
      difficulty: cfg.difficulty || 'medium'
    });
    t.seed = seed;
    t.p2pLaps = Math.max(1, Number(cfg.laps) || 1);
    return t;
  }

  // Creates a P2P session manager for a player (either hosting or joining).
  function createSession(options) {
    const opts = options || {};
    const localUser = String(opts.user || 'driver-' + Math.floor(Math.random() * 900 + 100));
    const RTCPeer = opts.RTCPeerConnection || root.RTCPeerConnection || root.webkitRTCPeerConnection;
    const BC = opts.BroadcastChannel === false ? null : (opts.BroadcastChannel || root.BroadcastChannel);
    const sendSignal = opts.sendSignal || (async (targetUser, payload) => {
      if (typeof root.fbPost === 'function') {
        await root.fbPost('inbox/' + String(targetUser).trim().toLowerCase(), Object.assign({
          from: localUser,
          ts: Date.now()
        }, payload));
      }
    });

    let roomId = opts.roomId || randomRoomId();
    let isHost = opts.isHost !== false;
    let closed = false;
    let bc = null;

    let trackConfig = {
      seed: (opts.seed >>> 0) || ((Math.random() * 0xffffffff) >>> 0) || 123456789,
      generation: Number(opts.generation) || 3,
      mode: opts.mode || 'short',
      difficulty: opts.difficulty || 'medium',
      laps: Math.max(1, Number(opts.laps) || 1),
      carId: opts.carId || '',
      paint: opts.paint || '#33c4ce'
    };

    // Map of peerId -> { user, pc, controlChannel, stateChannel, connected, state, ready, finishMs, transport }
    const peers = new Map();
    const listeners = {};

    function on(event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
      return () => {
        const arr = listeners[event];
        if (!arr) return;
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      };
    }

    function emit(event, data) {
      const arr = listeners[event];
      if (!arr) return;
      for (const fn of arr.slice()) {
        try { fn(data); } catch (e) { console.error('[RaceP2P]', event, e); }
      }
    }

    function ensurePeer(peerUser, transport) {
      const id = String(peerUser || '').trim().toLowerCase();
      if (!id || id === localUser.toLowerCase()) return null;
      let p = peers.get(id);
      if (!p) {
        p = {
          user: id,
          pc: null,
          controlChannel: null,
          stateChannel: null,
          connected: false,
          ready: false,
          finishMs: null,
          checkpoints: 0,
          finishes: 0,
          carId: '',
          paint: '#ee764a',
          state: null,
          lastSeen: Date.now(),
          transport: transport || 'webrtc'
        };
        peers.set(id, p);
        emit('peers', getPeersList());
      } else if (transport) {
        p.transport = transport;
      }
      return p;
    }

    function getPeersList() {
      const list = [];
      for (const p of peers.values()) {
        list.push({
          user: p.user,
          connected: p.connected,
          ready: p.ready,
          finishMs: p.finishMs,
          checkpoints: p.checkpoints,
          finishes: p.finishes,
          carId: p.carId,
          paint: p.paint,
          state: p.state,
          transport: p.transport
        });
      }
      return list;
    }

    function setupBroadcastChannel(id) {
      if (bc) {
        try { bc.close(); } catch (e) {}
        bc = null;
      }
      if (!BC) return;
      try {
        bc = new BC('apex-p2p-' + id);
        bc.onmessage = (ev) => {
          const msg = ev && ev.data;
          if (!msg || msg.from === localUser) return;
          if (msg.to && msg.to.toLowerCase() !== localUser.toLowerCase()) return;
          const peer = ensurePeer(msg.from, 'local-p2p');
          if (!peer) return;
          if (!peer.connected) {
            peer.connected = true;
            emit('peer_connected', { user: peer.user, transport: 'local-p2p' });
            emit('peers', getPeersList());
          }
          handlePeerMessage(peer, msg.payload);
        };
        // Announce presence on local BroadcastChannel so same-browser/LAN tabs link up immediately
        bc.postMessage({
          from: localUser,
          payload: {
            type: 'hello',
            user: localUser,
            roomId,
            isHost,
            trackConfig: isHost ? trackConfig : undefined
          }
        });
      } catch (e) {}
    }

    setupBroadcastChannel(roomId);

    function sendToPeer(peer, payload, unreliable) {
      if (!peer || closed) return false;
      const packet = Object.assign({}, payload, { from: localUser, roomId });
      const raw = JSON.stringify(packet);
      if (unreliable && peer.stateChannel && peer.stateChannel.readyState === 'open') {
        try { peer.stateChannel.send(raw); return true; } catch (e) {}
      }
      if (peer.controlChannel && peer.controlChannel.readyState === 'open') {
        try { peer.controlChannel.send(raw); return true; } catch (e) {}
      }
      if (typeof peer.directSend === 'function') {
        try { peer.directSend(packet); return true; } catch (e) {}
      }
      if (bc && (peer.transport === 'local-p2p' || !peer.pc)) {
        try {
          bc.postMessage({ from: localUser, to: peer.user, payload: packet });
          return true;
        } catch (e) {}
      }
      return false;
    }

    function broadcast(payload, unreliable) {
      if (closed) return;
      const packet = Object.assign({}, payload, { from: localUser, roomId });
      for (const peer of peers.values()) {
        sendToPeer(peer, packet, unreliable);
      }
      if (bc && !peers.size) {
        try { bc.postMessage({ from: localUser, payload: packet }); } catch (e) {}
      }
    }

    function handlePeerMessage(peer, msg) {
      if (!msg || typeof msg !== 'object') return;
      peer.lastSeen = Date.now();
      if (!peer.connected) {
        peer.connected = true;
        emit('peer_connected', { user: peer.user, transport: peer.transport });
      }
      switch (msg.type) {
        case 'hello': {
          if (msg.carId) peer.carId = msg.carId;
          if (msg.paint) peer.paint = msg.paint;
          if (!isHost && msg.isHost && msg.trackConfig) {
            trackConfig = Object.assign({}, trackConfig, msg.trackConfig);
            emit('config', trackConfig);
          }
          if (isHost && !msg.reply) {
            sendToPeer(peer, {
              type: 'hello',
              reply: true,
              user: localUser,
              isHost: true,
              carId: trackConfig.carId,
              paint: trackConfig.paint,
              trackConfig
            }, false);
          }
          emit('peers', getPeersList());
          break;
        }
        case 'config': {
          if (!isHost && msg.trackConfig) {
            trackConfig = Object.assign({}, trackConfig, msg.trackConfig);
            emit('config', trackConfig);
          }
          break;
        }
        case 'ready': {
          peer.ready = !!msg.ready;
          if (msg.carId) peer.carId = msg.carId;
          if (msg.paint) peer.paint = msg.paint;
          emit('peers', getPeersList());
          break;
        }
        case 'start_race': {
          if (msg.trackConfig) {
            trackConfig = Object.assign({}, trackConfig, msg.trackConfig);
          }
          for (const p of peers.values()) {
            p.finishMs = null;
            p.checkpoints = 0;
            p.finishes = 0;
          }
          emit('start_race', {
            roomId,
            trackConfig,
            countdownMs: Number(msg.countdownMs) || 3000,
            startAt: Number(msg.startAt) || (Date.now() + 3000)
          });
          break;
        }
        case 'telemetry': {
          peer.state = msg.car || null;
          if (msg.car) {
            if (msg.car.carId) peer.carId = msg.car.carId;
            if (msg.car.paint) peer.paint = msg.car.paint;
            if (typeof msg.car.checkpoint === 'number') peer.checkpoints = msg.car.checkpoint;
            if (typeof msg.car.finishes === 'number') peer.finishes = msg.car.finishes;
          }
          // If host in a multi-peer star topology, relay telemetry directly to other peers P2P
          if (isHost && peers.size > 1 && !msg.relayed) {
            for (const other of peers.values()) {
              if (other.user !== peer.user && other.connected) {
                sendToPeer(other, Object.assign({}, msg, { relayed: true, from: peer.user }), true);
              }
            }
          }
          emit('telemetry', { user: peer.user, car: peer.state });
          break;
        }
        case 'finish': {
          peer.finishMs = Number(msg.timeMs) || 0;
          peer.finishes = Number(msg.finishes) || trackConfig.laps;
          if (isHost && peers.size > 1 && !msg.relayed) {
            for (const other of peers.values()) {
              if (other.user !== peer.user && other.connected) {
                sendToPeer(other, Object.assign({}, msg, { relayed: true, from: peer.user }), false);
              }
            }
          }
          emit('finish', { user: peer.user, timeMs: peer.finishMs });
          emit('peers', getPeersList());
          break;
        }
        case 'chat': {
          emit('chat', { user: peer.user, text: String(msg.text || '').slice(0, 140) });
          break;
        }
      }
    }

    function wireDataChannel(peer, dc, kind) {
      if (kind === 'state') peer.stateChannel = dc;
      else peer.controlChannel = dc;

      dc.onopen = () => {
        peer.connected = true;
        peer.transport = 'webrtc';
        sendToPeer(peer, {
          type: 'hello',
          user: localUser,
          isHost,
          carId: trackConfig.carId,
          paint: trackConfig.paint,
          trackConfig: isHost ? trackConfig : undefined
        }, false);
        emit('peer_connected', { user: peer.user, transport: 'webrtc' });
        emit('peers', getPeersList());
      };
      dc.onclose = () => {
        const ctrlOpen = peer.controlChannel && peer.controlChannel.readyState === 'open';
        const stateOpen = peer.stateChannel && peer.stateChannel.readyState === 'open';
        if (!ctrlOpen && !stateOpen && peer.transport === 'webrtc') {
          peer.connected = false;
          emit('peer_disconnected', { user: peer.user });
          emit('peers', getPeersList());
        }
      };
      dc.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          handlePeerMessage(peer, data);
        } catch (e) {}
      };
    }

    async function waitIceGathering(pc, timeoutMs) {
      if (!pc || pc.iceGatheringState === 'complete') return;
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, timeoutMs || 1800);
        const check = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timer);
            resolve();
          }
        };
        if (typeof pc.addEventListener === 'function') {
          pc.addEventListener('icegatheringstatechange', check);
        } else {
          pc.onicegatheringstatechange = check;
        }
      });
    }

    // Create a WebRTC offer for a specific friend or manual room code
    async function createOffer(targetUser) {
      const peerKey = (targetUser || 'guest-' + (peers.size + 1)).trim().toLowerCase();
      const peer = ensurePeer(peerKey, 'webrtc');
      if (!RTCPeer) {
        // Fallback when WebRTC is unavailable (e.g. restricted browser or local test):
        // return a P2P room descriptor that connects via BroadcastChannel / local transport
        const offerPacket = {
          v: 1,
          kind: 'offer',
          roomId,
          host: localUser,
          target: peerKey,
          trackConfig,
          sdp: null
        };
        return { code: encodePacket(offerPacket), packet: offerPacket };
      }

      if (peer.pc) {
        try { peer.pc.close(); } catch (e) {}
      }
      const pc = new RTCPeer({ iceServers: DEFAULT_ICE_SERVERS });
      peer.pc = pc;

      const ctrl = pc.createDataChannel('apex-control', { ordered: true });
      const stateDc = pc.createDataChannel('apex-state', { ordered: false, maxRetransmits: 0 });
      wireDataChannel(peer, ctrl, 'control');
      wireDataChannel(peer, stateDc, 'state');

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIceGathering(pc, 1500);

      const offerPacket = {
        v: 1,
        kind: 'offer',
        roomId,
        host: localUser,
        target: peerKey,
        trackConfig,
        sdp: pc.localDescription
          ? { type: pc.localDescription.type, sdp: pc.localDescription.sdp }
          : { type: offer.type, sdp: offer.sdp }
      };
      return { code: encodePacket(offerPacket), packet: offerPacket };
    }

    // Accept an incoming WebRTC offer (from friend invite or pasted room code) and produce an answer
    async function acceptOffer(offerInput) {
      const pkt = typeof offerInput === 'string' ? decodePacket(offerInput) : offerInput;
      if (!pkt || pkt.kind !== 'offer') throw new Error('Invalid P2P race offer');
      isHost = false;
      roomId = pkt.roomId || roomId;
      if (pkt.trackConfig) {
        trackConfig = Object.assign({}, trackConfig, pkt.trackConfig);
        emit('config', trackConfig);
      }
      setupBroadcastChannel(roomId);

      const hostUser = String(pkt.host || 'host').trim().toLowerCase();
      const peer = ensurePeer(hostUser, pkt.sdp && RTCPeer ? 'webrtc' : 'local-p2p');

      if (!pkt.sdp || !RTCPeer) {
        peer.connected = true;
        sendToPeer(peer, {
          type: 'hello',
          user: localUser,
          isHost: false,
          carId: trackConfig.carId,
          paint: trackConfig.paint
        }, false);
        emit('peer_connected', { user: peer.user, transport: 'local-p2p' });
        emit('peers', getPeersList());
        const ans = { v: 1, kind: 'answer', roomId, guest: localUser, host: hostUser, sdp: null };
        return { code: encodePacket(ans), packet: ans };
      }

      if (peer.pc) {
        try { peer.pc.close(); } catch (e) {}
      }
      const pc = new RTCPeer({ iceServers: DEFAULT_ICE_SERVERS });
      peer.pc = pc;
      pc.ondatachannel = (ev) => {
        const dc = ev.channel;
        if (!dc) return;
        wireDataChannel(peer, dc, dc.label === 'apex-state' ? 'state' : 'control');
      };

      await pc.setRemoteDescription(pkt.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitIceGathering(pc, 1500);

      const answerPacket = {
        v: 1,
        kind: 'answer',
        roomId,
        guest: localUser,
        host: hostUser,
        sdp: pc.localDescription
          ? { type: pc.localDescription.type, sdp: pc.localDescription.sdp }
          : { type: answer.type, sdp: answer.sdp }
      };
      return { code: encodePacket(answerPacket), packet: answerPacket };
    }

    // Complete handshake on host when friend's WebRTC answer arrives
    async function acceptAnswer(answerInput) {
      const pkt = typeof answerInput === 'string' ? decodePacket(answerInput) : answerInput;
      if (!pkt || pkt.kind !== 'answer') throw new Error('Invalid P2P race answer');
      const guestUser = String(pkt.guest || '').trim().toLowerCase();
      let peer = peers.get(guestUser);
      if (!peer) {
        // Check if we created a placeholder 'guest-1' peer for manual code exchange
        for (const [k, v] of peers.entries()) {
          if (k.startsWith('guest-') && !v.connected) {
            peers.delete(k);
            v.user = guestUser || k;
            peers.set(v.user, v);
            peer = v;
            break;
          }
        }
      }
      if (!peer) peer = ensurePeer(guestUser || 'guest', pkt.sdp ? 'webrtc' : 'local-p2p');
      if (pkt.sdp && peer && peer.pc) {
        await peer.pc.setRemoteDescription(pkt.sdp);
      } else if (peer) {
        peer.connected = true;
        emit('peer_connected', { user: peer.user, transport: 'local-p2p' });
        emit('peers', getPeersList());
      }
      return peer;
    }

    // Invite a friend by sending the P2P WebRTC offer directly to their notification inbox
    async function inviteFriend(friendUser) {
      const target = String(friendUser || '').trim().toLowerCase();
      if (!target || target === localUser.toLowerCase()) throw new Error('Pick a friend to invite.');
      const { code, packet } = await createOffer(target);
      await sendSignal(target, {
        kind: 'p2p_race_invite',
        roomId,
        host: localUser,
        offerCode: code,
        trackConfig
      });
      return { roomId, target, offerCode: code, packet };
    }

    // Direct in-memory pipe for deterministic unit tests (connects two sessions directly P2P)
    function linkDirectPeer(otherSession) {
      const otherUser = otherSession.user();
      const mePeer = ensurePeer(otherUser, 'direct-p2p');
      const themPeer = otherSession._ensurePeer(localUser, 'direct-p2p');
      mePeer.connected = true;
      themPeer.connected = true;
      mePeer.directSend = (pkt) => otherSession._deliverDirect(localUser, pkt);
      themPeer.directSend = (pkt) => _deliverDirect(otherUser, pkt);
      sendToPeer(mePeer, {
        type: 'hello',
        user: localUser,
        isHost,
        carId: trackConfig.carId,
        paint: trackConfig.paint,
        trackConfig: isHost ? trackConfig : undefined
      }, false);
      emit('peer_connected', { user: mePeer.user, transport: 'direct-p2p' });
      emit('peers', getPeersList());
    }

    function _deliverDirect(fromUser, packet) {
      if (closed) return;
      const peer = ensurePeer(fromUser, 'direct-p2p');
      if (peer) handlePeerMessage(peer, packet);
    }

    function setTrackConfig(patch) {
      trackConfig = Object.assign({}, trackConfig, patch || {});
      if (isHost) {
        broadcast({ type: 'config', trackConfig }, false);
      }
      emit('config', trackConfig);
      return trackConfig;
    }

    function setReady(ready, carMeta) {
      if (carMeta && carMeta.carId) trackConfig.carId = carMeta.carId;
      if (carMeta && carMeta.paint) trackConfig.paint = carMeta.paint;
      broadcast({
        type: 'ready',
        ready: !!ready,
        carId: trackConfig.carId,
        paint: trackConfig.paint
      }, false);
    }

    function startHostRace(customConfig) {
      if (!isHost) throw new Error('Only the host can start the P2P race.');
      if (customConfig) {
        trackConfig = Object.assign({}, trackConfig, customConfig);
      }
      for (const p of peers.values()) {
        p.finishMs = null;
        p.checkpoints = 0;
        p.finishes = 0;
      }
      const startPayload = {
        type: 'start_race',
        roomId,
        trackConfig,
        countdownMs: 3000,
        startAt: Date.now() + 3000
      };
      broadcast(startPayload, false);
      emit('start_race', startPayload);
      return startPayload;
    }

    function sendTelemetry(carState) {
      if (closed || !carState) return;
      broadcast({
        type: 'telemetry',
        car: {
          x: Math.round(carState.x * 100) / 100,
          y: Math.round(carState.y * 100) / 100,
          z: Math.round(carState.z * 100) / 100,
          yaw: Math.round((carState.yaw || 0) * 1000) / 1000,
          pitch: Math.round((carState.pitch || 0) * 1000) / 1000,
          roll: Math.round((carState.roll || 0) * 1000) / 1000,
          speed: Math.round((carState.speed || 0) * 10) / 10,
          steer: Math.round((carState.steer || 0) * 100) / 100,
          drift: Math.round((carState.drift || 0) * 100) / 100,
          grounded: carState.grounded !== false,
          hyper: !!carState.hyper,
          boost: !!carState.boost,
          forward: carState.forward ? { x: carState.forward.x, y: carState.forward.y, z: carState.forward.z } : undefined,
          normal: carState.normal ? { x: carState.normal.x, y: carState.normal.y, z: carState.normal.z } : undefined,
          right: carState.right ? { x: carState.right.x, y: carState.right.y, z: carState.right.z } : undefined,
          checkpoint: carState.checkpoint | 0,
          finishes: carState.finishes | 0,
          elapsed: Math.round((carState.elapsed || 0) * 1000) / 1000,
          carId: carState.carId || trackConfig.carId || '',
          paint: carState.paint || trackConfig.paint || '#33c4ce'
        }
      }, true);
    }

    function sendFinish(timeMs, finishes) {
      broadcast({
        type: 'finish',
        timeMs: Math.round(Number(timeMs) || 0),
        finishes: finishes || trackConfig.laps
      }, false);
    }

    function close() {
      closed = true;
      if (bc) {
        try { bc.close(); } catch (e) {}
        bc = null;
      }
      for (const peer of peers.values()) {
        try { peer.controlChannel && peer.controlChannel.close(); } catch (e) {}
        try { peer.stateChannel && peer.stateChannel.close(); } catch (e) {}
        try { peer.pc && peer.pc.close(); } catch (e) {}
      }
      peers.clear();
      emit('close', {});
    }

    return {
      user: () => localUser,
      roomId: () => roomId,
      isHost: () => isHost,
      getTrackConfig: () => Object.assign({}, trackConfig),
      setTrackConfig,
      getPeers: getPeersList,
      createOffer,
      acceptOffer,
      acceptAnswer,
      inviteFriend,
      linkDirectPeer,
      setReady,
      startHostRace,
      sendTelemetry,
      sendFinish,
      on,
      close,
      _ensurePeer: ensurePeer,
      _deliverDirect
    };
  }

  // Active browser P2P session singleton so notifications & social panel can interact with it
  let activeSession = null;

  function getActiveSession() {
    return activeSession;
  }

  function startHostSession(options) {
    if (activeSession) activeSession.close();
    const user = (typeof state !== 'undefined' && state && state.user) || root.currentUser || (options && options.user) || 'host';
    activeSession = createSession(Object.assign({ user, isHost: true }, options || {}));
    return activeSession;
  }

  async function joinFromInvite(invite) {
    if (!invite || !invite.offerCode) throw new Error('Missing P2P race offer');
    if (activeSession) activeSession.close();
    const user = (typeof state !== 'undefined' && state && state.user) || root.currentUser || 'guest';
    activeSession = createSession({
      user,
      isHost: false,
      roomId: invite.roomId
    });
    const ans = await activeSession.acceptOffer(invite.offerCode);
    if (invite.from && typeof root.fbPost === 'function') {
      await root.fbPost('inbox/' + String(invite.from).trim().toLowerCase(), {
        kind: 'p2p_race_answer',
        from: user,
        roomId: activeSession.roomId(),
        answerCode: ans.code,
        ts: Date.now()
      });
    }
    if (root.gameRace && typeof root.gameRace.start === 'function') {
      if (!root.gameRace.active) {
        await root.gameRace.start({ p2p: true, session: activeSession });
      } else if (typeof root.gameRace.attachP2P === 'function') {
        root.gameRace.attachP2P(activeSession);
      }
    }
    return activeSession;
  }

  async function handleAnswerSignal(signal) {
    if (!activeSession || !signal || !signal.answerCode) return;
    await activeSession.acceptAnswer(signal.answerCode);
    if (typeof root.toast === 'function') {
      root.toast('🏁 <b>' + (signal.from || 'Friend') + '</b> connected via P2P to your race lobby!', 3500);
    }
  }

  // Open a standalone P2P Race Host/Join modal (e.g., from Friends list or Racetrack hotspot)
  function openLobbyModal(preselectFriend) {
    if (root.gameRace && typeof root.gameRace.start === 'function') {
      root.gameRace.start({ p2p: true, inviteFriend: preselectFriend || null });
    }
  }

  const api = {
    mulberry32,
    encodePacket,
    decodePacket,
    buildTrackFromConfig,
    createSession,
    getActiveSession,
    startHostSession,
    joinFromInvite,
    handleAnswerSignal,
    openLobbyModal
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.RaceP2P = api;
})(globalThis);
