const LOCAL_KEY = "x3.local";
const TOKEN_KEY = "x3.token";

let mode = "local"; // "local" | "server"
let token = "";
let user = null;

function uuid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function adjustedMs(time_ms, penalty) {
  return penalty === "PLUS_TWO" ? time_ms + 2000 : time_ms;
}

/* ---------------- local persistence ---------------- */

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {};
  } catch (err) {
    return {};
  }
}

function saveLocal(d) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
  } catch (err) {
    /* ignore quota errors */
  }
}

const local = {
  listSessions() {
    const d = loadLocal();
    const sessions = d.sessions || [];
    const solves = d.solves || [];
    return sessions.map((s) => ({
      ...s,
      solve_count: solves.filter((v) => v.session_id === s.id).length,
    }));
  },

  createSession({ name, event }) {
    const d = loadLocal();
    const s = { id: uuid(), name, event, created_at: new Date().toISOString() };
    d.sessions = d.sessions || [];
    d.sessions.push(s);
    saveLocal(d);
    return { ...s, solve_count: 0 };
  },

  deleteSession(id) {
    const d = loadLocal();
    d.sessions = (d.sessions || []).filter((s) => s.id !== id);
    d.solves = (d.solves || []).filter((v) => v.session_id !== id);
    d.deletedSessions = d.deletedSessions || [];
    d.deletedSessions.push(id);
    saveLocal(d);
  },

  listSolves(session_id) {
    const d = loadLocal();
    return (d.solves || []).filter((v) => v.session_id === session_id);
  },

  createSolve({ session_id, scramble, time_ms, penalty }) {
    const d = loadLocal();
    const v = {
      id: uuid(),
      session_id,
      scramble,
      time_ms,
      penalty,
      adjusted_ms: adjustedMs(time_ms, penalty),
      solved_at: new Date().toISOString(),
    };
    d.solves = d.solves || [];
    d.solves.push(v);
    saveLocal(d);
    return v;
  },

  patchSolve(id, penalty) {
    const d = loadLocal();
    const v = (d.solves || []).find((x) => x.id === id);
    if (!v) throw new Error("solve not found");
    v.penalty = penalty;
    v.adjusted_ms = adjustedMs(v.time_ms, penalty);
    saveLocal(d);
    return v;
  },

  deleteSolve(id) {
    const d = loadLocal();
    d.solves = (d.solves || []).filter((v) => v.id !== id);
    d.deletedSolves = d.deletedSolves || [];
    d.deletedSolves.push(id);
    saveLocal(d);
  },
};

/* ---------------- server operations ---------------- */

async function serverApi(path, opts = {}) {
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.detail) || res.statusText);
  return body;
}

function mapSession(s) {
  return {
    id: s.client_id,
    name: s.name,
    event: s.event,
    created_at: s.created_at,
    solve_count: s.solve_count,
  };
}

function mapSolve(v) {
  return {
    id: v.client_id,
    session_id: v.session_client_id,
    scramble: v.scramble,
    time_ms: v.time_ms,
    penalty: v.penalty,
    adjusted_ms: v.adjusted_ms,
    solved_at: v.solved_at,
  };
}

const server = {
  async listSessions() {
    return (await serverApi("/api/sessions")).map(mapSession);
  },
  async createSession({ name, event }) {
    return mapSession(await serverApi("/api/sessions", { method: "POST", body: JSON.stringify({ name, event }) }));
  },
  async deleteSession(id) {
    await serverApi(`/api/sessions/${id}`, { method: "DELETE" });
  },
  async listSolves(session_id) {
    return (await serverApi(`/api/sessions/${session_id}/solves`)).map(mapSolve);
  },
  async createSolve({ session_id, scramble, time_ms, penalty }) {
    return mapSolve(
      await serverApi("/api/solves", {
        method: "POST",
        body: JSON.stringify({ session_client_id: session_id, scramble, time_ms, penalty }),
      })
    );
  },
  async patchSolve(id, penalty) {
    return mapSolve(await serverApi(`/api/solves/${id}`, { method: "PATCH", body: JSON.stringify({ penalty }) }));
  },
  async deleteSolve(id) {
    await serverApi(`/api/solves/${id}`, { method: "DELETE" });
  },
};

/* ---------------- public store ---------------- */

export const store = {
  get mode() {
    return mode;
  },
  async listSessions() {
    return mode === "local" ? local.listSessions() : server.listSessions();
  },
  async createSession(input) {
    return mode === "local" ? local.createSession(input) : server.createSession(input);
  },
  async deleteSession(id) {
    return mode === "local" ? local.deleteSession(id) : server.deleteSession(id);
  },
  async listSolves(session_id) {
    return mode === "local" ? local.listSolves(session_id) : server.listSolves(session_id);
  },
  async createSolve(input) {
    return mode === "local" ? local.createSolve(input) : server.createSolve(input);
  },
  async patchSolve(id, penalty) {
    return mode === "local" ? local.patchSolve(id, penalty) : server.patchSolve(id, penalty);
  },
  async deleteSolve(id) {
    return mode === "local" ? local.deleteSolve(id) : server.deleteSolve(id);
  },
};

/* ---------------- auth + sync ---------------- */

async function doSync() {
  const d = loadLocal();
  const payload = {
    sessions: (d.sessions || []).map((s) => ({
      client_id: s.id,
      name: s.name,
      event: s.event,
      created_at: s.created_at,
    })),
    solves: (d.solves || []).map((v) => ({
      client_id: v.id,
      session_client_id: v.session_id,
      scramble: v.scramble,
      time_ms: v.time_ms,
      penalty: v.penalty,
      solved_at: v.solved_at,
    })),
    deleted_sessions: d.deletedSessions || [],
    deleted_solves: d.deletedSolves || [],
  };
  const res = await serverApi("/api/sync", { method: "POST", body: JSON.stringify(payload) });
  saveLocal({
    sessions: res.sessions.map(mapSession),
    solves: res.solves.map(mapSolve),
  });
}

async function loadServerState() {
  const sessions = await server.listSessions();
  const solves = [];
  for (const s of sessions) {
    solves.push(...(await server.listSolves(s.id)));
  }
  return { sessions, solves };
}

export const auth = {
  isSignedIn() {
    return mode === "server";
  },
  getUser() {
    return user;
  },
  login() {
    window.location.href = "/api/auth/login";
  },
  async init() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      try {
        const res = await serverApi("/api/auth/exchange", {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        token = res.token || "";
        if (token) {
          try {
            localStorage.setItem(TOKEN_KEY, token);
          } catch (err) {
            /* ignore */
          }
        }
      } catch (err) {
        /* ignore; stay in local mode */
      }
      history.replaceState({}, "", window.location.pathname + window.location.hash);
    } else {
      try {
        token = localStorage.getItem(TOKEN_KEY) || "";
      } catch (err) {
        token = "";
      }
    }
    if (!token) return;
    try {
      user = await serverApi("/api/auth/me");
      mode = "server";
      await doSync();
    } catch (err) {
      token = "";
      user = null;
      mode = "local";
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch (e) {
        /* ignore */
      }
    }
  },
  async signOut() {
    if (mode !== "server") return;
    try {
      const d = await loadServerState();
      saveLocal(d);
    } catch (err) {
      /* keep local as-is */
    }
    try {
      await serverApi("/api/auth/logout", { method: "POST" });
    } catch (err) {
      /* ignore */
    }
    token = "";
    user = null;
    mode = "local";
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      /* ignore */
    }
  },
};
