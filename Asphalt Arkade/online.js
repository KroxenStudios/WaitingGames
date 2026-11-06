// Asphalt Arkade Online: Netzwerk und Interpolation der anderen Fahrer, des Verkehrs
// und der Verfolger. Es werden nur Fahrzeugdaten gesendet (kein Chat, keine Namen).
(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const SERVER_URL =
    params.get("server") ||
    "wss://asphalt-arkade-online.kroxenstudios.workers.dev/ws";

  const SEND_MS = 50;             // Sendetakt des eigenen Autos
  const INTERPOLATION_MS = 100;   // Anzeige der Fahrer liegt etwas hinter der Echtzeit
  const TRAFFIC_INTERP_MS = 170;  // Verkehr kommt seltener, braucht mehr Puffer
  const STALE_MS = 3000;          // ohne Update verschwindet ein Fahrer
  const TRAFFIC_STALE_MS = 1500;

  let ws = null;
  let wanted = false;
  let retryTimer = 0;
  let retryDelay = 1500;
  let pingTimer = 0;
  let lastSend = 0;

  // Position aus einer Schnappschuss-Liste zum Zeitpunkt renderTime bestimmen.
  function sample(buf, renderTime) {
    let from = buf[0];
    let to = buf[0];

    for (let i = 0; i < buf.length; i++) {
      if (buf[i].t <= renderTime) from = to = buf[i];
      else {
        to = buf[i];
        break;
      }
    }

    let k = 0;
    if (to !== from) {
      k = Math.min(1, Math.max(0, (renderTime - from.t) / (to.t - from.t)));
    }

    return { from, to, k };
  }

  const lerp = (a, b, k) => a + (b - a) * k;

  function lerpAngle(a, b, k) {
    let d = b - a;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return a + d * k;
  }

  const api = {
    status: "off",          // off | connecting | online | error
    count: 0,               // Fahrer insgesamt im Raum (inklusive dir)
    remotes: new Map(),     // id -> anderer Fahrer (interpoliert)
    netNpcs: new Map(),     // id -> Verkehrsauto des Hosts (interpoliert)
    myId: null,
    hostId: null,           // Verkehrs-Host des Raums
    onHit: null,            // (vonId, jx, jy): Stoß eines anderen Fahrers
    onNpcHit: null,         // (npcId, dvx, dvy, dva): Stoß gegen ein Verkehrsauto (nur beim Host)

    // Bin ich der Verkehrs-Host? (ohne Verbindung simuliert jeder seinen Verkehr selbst)
    get isHost() {
      return api.status !== "online" || api.hostId === null || api.hostId === api.myId;
    },

    // Online-Modus ein-/ausschalten (kann jederzeit aufgerufen werden).
    enable(on) {
      on = !!on;
      if (on === wanted) return;
      wanted = on;
      if (on) {
        retryDelay = 1500;
        connect();
      } else {
        disconnect();
      }
    },

    // Eigenen Zustand senden (höchstens alle SEND_MS). s.q = Verfolger [[x, y, Winkel], ...]
    send(s) {
      const now = performance.now();
      if (!ws || ws.readyState !== WebSocket.OPEN || now - lastSend < SEND_MS) return;
      lastSend = now;

      const r1 = v => Math.round(v * 10) / 10;
      const r2 = v => Math.round(v * 100) / 100;

      ws.send(
        JSON.stringify({
          t: "s",
          x: r1(s.x),
          y: r1(s.y),
          a: r2(s.a),
          vx: r2(s.vx),
          vy: r2(s.vy),
          c: s.c,
          l: s.l,
          k: s.k,
          q: s.q || []
        })
      );
    },

    // Verkehr senden (nur der Host, höchstens alle TRAFFIC_MS).
    // Zeilen: [id, x, y, Winkel, Art 0-3, Farbe, vx, vy, bremst]
    sendTraffic(rows) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ t: "n", p: rows }));
    },

    // Stoß an einen anderen Fahrer weitergeben (Impuls in px/Bild).
    sendHit(to, jx, jy) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ t: "h", to, x: Math.round(jx * 1000) / 1000, y: Math.round(jy * 1000) / 1000 }));
    },

    // Stoß gegen ein Verkehrsauto an den Host melden.
    sendNpcHit(id, dvx, dvy, dva) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        t: "nh",
        id,
        x: Math.round(dvx * 1000) / 1000,
        y: Math.round(dvy * 1000) / 1000,
        r: Math.round(dva * 10000) / 10000
      }));
    },

    // Pro Bild aufrufen: berechnet die angezeigte Position aller anderen Fahrer und Autos.
    update(now) {
      const renderTime = now - INTERPOLATION_MS;

      for (const [id, r] of api.remotes) {
        if (now - r.seenAt > STALE_MS) {
          api.remotes.delete(id);
          continue;
        }

        const { from, to, k } = sample(r.buf, renderTime);

        r.x = lerp(from.x, to.x, k);
        r.y = lerp(from.y, to.y, k);
        r.a = lerpAngle(from.a, to.a, k);
        r.vx = lerp(from.vx, to.vx, k);
        r.vy = lerp(from.vy, to.vy, k);

        // Verfolger dieses Fahrers: nur mischen, wenn die Anzahl gleich geblieben ist
        const qa = from.q, qb = to.q;
        const src = qa.length === qb.length ? qa : qb;
        while (r.chasers.length < src.length) {
          r.chasers.push({ x: 0, y: 0, a: 0, angle: 0, vx: 0, vy: 0, id: -1, chaser: true, stun: 0 });
        }
        r.chasers.length = src.length;
        for (let i = 0; i < src.length; i++) {
          const c = r.chasers[i];
          const other = qa.length === qb.length ? qb[i] : src[i];
          c.x = lerp(src[i][0], other[0], k);
          c.y = lerp(src[i][1], other[1], k);
          c.a = c.angle = lerpAngle(src[i][2], other[2], k);
        }
      }

      const npcTime = now - TRAFFIC_INTERP_MS;

      for (const [id, n] of api.netNpcs) {
        if (now - n.seenAt > TRAFFIC_STALE_MS) {
          api.netNpcs.delete(id);
          continue;
        }

        const { from, to, k } = sample(n.buf, npcTime);

        n.x = lerp(from.x, to.x, k);
        n.y = lerp(from.y, to.y, k);
        n.angle = lerpAngle(from.a, to.a, k);
        n.vx = to.vx;
        n.vy = to.vy;
      }
    }
  };

  function connect() {
    if (!wanted || ws) return;

    api.status = "connecting";

    try {
      ws = new WebSocket(SERVER_URL);
    } catch {
      ws = null;
      api.status = "error";
      scheduleRetry();
      return;
    }

    const mine = ws;

    mine.addEventListener("open", () => {
      api.status = "online";
      retryDelay = 1500;
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (mine.readyState === WebSocket.OPEN) mine.send('{"t":"p"}');
      }, 4000);
    });

    mine.addEventListener("message", event => {
      let m;
      try {
        m = JSON.parse(event.data);
      } catch {
        return;
      }

      if (m.t === "hi") {
        api.myId = m.id;
        return;
      }

      if (m.t === "h") {
        if (api.onHit) api.onHit(m.from, Number(m.x) || 0, Number(m.y) || 0);
        return;
      }

      if (m.t === "nh") {
        if (api.onNpcHit) api.onNpcHit(m.id, Number(m.x) || 0, Number(m.y) || 0, Number(m.r) || 0);
        return;
      }

      if (m.t === "n") {
        const now = performance.now();
        const present = new Set();

        for (const row of m.p) {
          const [id, x, y, a, kind, color, vx, vy, braking] = row;
          present.add(id);

          let n = api.netNpcs.get(id);
          if (!n) {
            n = { id, buf: [], x, y, angle: a, vx, vy, kindIdx: kind, color, braking: !!braking, seenAt: now, net: true };
            api.netNpcs.set(id, n);
          }

          n.buf.push({ t: now, x, y, a, vx, vy });
          if (n.buf.length > 8) n.buf.shift();

          n.kindIdx = kind;
          n.color = color;
          n.braking = !!braking;
          n.seenAt = now;
        }

        for (const id of api.netNpcs.keys()) {
          if (!present.has(id)) api.netNpcs.delete(id);
        }
        return;
      }

      if (m.t !== "w") return;

      const now = performance.now();
      api.count = m.n | 0;

      // Hat sich der Verkehrs-Host geändert, gehört der alte Verkehr nicht mehr zu uns.
      const host = m.h ?? null;
      if (host !== api.hostId) {
        api.hostId = host;
        api.netNpcs.clear();
      }

      const present = new Set();

      for (const row of m.p) {
        const [id, x, y, a, vx, vy, car, lvl, k, q] = row;
        present.add(id);

        let r = api.remotes.get(id);
        if (!r) {
          r = { id, buf: [], x, y, a, vx, vy, car, lvl, k, seenAt: now, chasers: [] };
          api.remotes.set(id, r);
        }

        r.buf.push({ t: now, x, y, a, vx, vy, q: q || [] });
        if (r.buf.length > 12) r.buf.shift();

        r.car = car;
        r.lvl = lvl;
        r.k = k;
        r.seenAt = now;
      }

      for (const id of api.remotes.keys()) {
        if (!present.has(id)) api.remotes.delete(id);
      }
    });

    const lost = () => {
      if (ws !== mine) return;
      ws = null;
      clearInterval(pingTimer);
      api.remotes.clear();
      api.netNpcs.clear();
      api.count = 0;
      api.myId = null;
      api.hostId = null;

      if (wanted) {
        api.status = "error";
        scheduleRetry();
      } else {
        api.status = "off";
      }
    };

    mine.addEventListener("close", lost);
    mine.addEventListener("error", lost);
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (wanted) connect();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 20000);
  }

  function disconnect() {
    clearTimeout(retryTimer);
    clearInterval(pingTimer);

    const old = ws;
    ws = null;

    if (old) {
      try {
        old.close(1000, "off");
      } catch {}
    }

    api.status = "off";
    api.remotes.clear();
    api.netNpcs.clear();
    api.count = 0;
    api.myId = null;
    api.hostId = null;
  }

  addEventListener("pagehide", () => {
    if (ws) {
      try {
        ws.close(1000, "pagehide");
      } catch {}
    }
  });

  window.AsphaltOnline = api;
})();
