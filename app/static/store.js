const LOCAL_KEY = "x3.local";
const TOKEN_KEY = "x3.token";
const PENDING_KEY = "x3.pending";
const READY_KEY = "x3.serverReady";

let mode = "local"; // "local" | "server"
let token = "";
let user = null;
let flushBlocked = false;

function setReady() {
  try {
    localStorage.setItem(READY_KEY, "1");
  } catch (err) {
    /* ignore */
  }
}

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

/* ---------------- pending write queue ---------------- */

function loadPending() {
  try {
    const ops = JSON.parse(localStorage.getItem(PENDING_KEY));
    return Array.isArray(ops) ? ops : [];
  } catch (err) {
    return [];
  }
}

function savePending(ops) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(ops));
  } catch (err) {
    /* ignore quota errors */
  }
}

function enqueue(op) {
  const ops = loadPending();
  ops.push(op);
  savePending(ops);
}

function mirrorSolveToLocal(v) {
  const d = loadLocal();
  d.solves = d.solves || [];
  if (!d.solves.some((s) => s.id === v.id)) d.solves.push(v);
  saveLocal(d);
}

function localSolve(id) {
  return (loadLocal().solves || []).find((s) => s.id === id);
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
    keepalive: !!opts.keepalive,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((body && body.detail) || res.statusText);
    err.status = res.status;
    throw err;
  }
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

function applyPending(session_id, rows) {
  const ops = loadPending();
  const d = loadLocal();
  const deletedSessions = new Set((d.deletedSessions || []).filter(Boolean));
  const deletedSolves = new Set((d.deletedSolves || []).filter(Boolean));
  if (deletedSessions.has(session_id)) return [];
  let out = rows.filter((s) => !deletedSolves.has(s.id));
  for (const op of ops) {
    if (op.kind === "create" && op.session_id === session_id) {
      if (deletedSolves.has(op.client_id)) continue;
      if (!out.some((s) => s.id === op.client_id)) {
        out.push({
          id: op.client_id,
          session_id,
          scramble: op.scramble,
          time_ms: op.time_ms,
          penalty: op.penalty,
          adjusted_ms: adjustedMs(op.time_ms, op.penalty),
          solved_at: op.solved_at,
        });
      }
    }
  }
  for (const op of ops) {
    if (op.kind === "patch") {
      const row = out.find((s) => s.id === op.client_id);
      if (row) {
        row.penalty = op.penalty;
        row.adjusted_ms = adjustedMs(row.time_ms, op.penalty);
      }
    } else if (op.kind === "delete") {
      out = out.filter((s) => s.id !== op.client_id);
    }
  }
  return out;
}

function reconcileServerState(serverSessions, serverSolves) {
  const d = loadLocal();
  const localSessions = Array.isArray(d.sessions) ? d.sessions : [];
  const localSolves = Array.isArray(d.solves) ? d.solves : [];
  const deletedSessions = new Set((d.deletedSessions || []).filter(Boolean));
  const deletedSolves = new Set((d.deletedSolves || []).filter(Boolean));
  const pendingBySolve = new Map();
  const pendingCreates = new Map();
  const pendingSessionIds = new Set();

  for (const op of loadPending()) {
    if (!op || !op.client_id) continue;
    if (op.kind === "create") pendingCreates.set(op.client_id, op);
    if (op.kind === "create" || op.kind === "patch" || op.kind === "delete") {
      pendingBySolve.set(op.client_id, op);
    }
  }
  for (const op of pendingBySolve.values()) {
    if (op.kind !== "delete" && op.session_id) pendingSessionIds.add(op.session_id);
  }

  const localSolveById = new Map();
  for (const v of localSolves) {
    if (!v.id) continue;
    localSolveById.set(v.id, v);
    const op = pendingBySolve.get(v.id);
    if (op && op.kind !== "delete" && v.session_id) pendingSessionIds.add(v.session_id);
  }

  const sessions = [];
  for (const s of Array.isArray(serverSessions) ? serverSessions : []) {
    if (s.id && deletedSessions.has(s.id)) continue;
    sessions.push(s);
  }
  for (const s of localSessions) {
    if (!s.id || !pendingSessionIds.has(s.id) || deletedSessions.has(s.id)) continue;
    if (!sessions.some((existing) => existing.id && existing.id === s.id)) sessions.push(s);
  }

  const solves = [];
  function addSolve(row) {
    if (row.id) {
      const index = solves.findIndex((existing) => existing.id === row.id);
      if (index >= 0) {
        solves[index] = row;
        return;
      }
    }
    solves.push(row);
  }

  for (const v of Array.isArray(serverSolves) ? serverSolves : []) {
    if (v.id && deletedSolves.has(v.id)) continue;
    if (v.session_id && deletedSessions.has(v.session_id)) continue;
    const pending = v.id ? pendingBySolve.get(v.id) : null;
    if (pending && pending.kind === "delete") continue;
    const local = v.id ? localSolveById.get(v.id) : null;
    addSolve(pending && local ? { ...local } : v);
  }
  for (const v of localSolves) {
    const pending = v.id ? pendingBySolve.get(v.id) : null;
    if (!pending || pending.kind === "delete") continue;
    if (v.id && deletedSolves.has(v.id)) continue;
    if (v.session_id && deletedSessions.has(v.session_id)) continue;
    addSolve({ ...v });
  }
  for (const [id, op] of pendingCreates) {
    const pending = pendingBySolve.get(id);
    if (!pending || pending.kind === "delete" || deletedSolves.has(id)) continue;
    if (solves.some((v) => v.id === id)) continue;
    addSolve({
      id,
      session_id: op.session_id,
      scramble: op.scramble,
      time_ms: op.time_ms,
      penalty: op.penalty,
      adjusted_ms: adjustedMs(op.time_ms, op.penalty),
      solved_at: op.solved_at,
    });
  }
  for (const op of pendingBySolve.values()) {
    if (op.kind !== "patch") continue;
    const row = solves.find((v) => v.id === op.client_id);
    if (row) {
      row.penalty = op.penalty;
      row.adjusted_ms = adjustedMs(row.time_ms, op.penalty);
    }
  }

  return { ...d, sessions, solves };
}

const server = {
  async listSessions() {
    const deletedSessions = new Set((loadLocal().deletedSessions || []).filter(Boolean));
    return (await serverApi("/api/sessions"))
      .map(mapSession)
      .filter((s) => !deletedSessions.has(s.id));
  },
  async createSession({ name, event }) {
    return mapSession(await serverApi("/api/sessions", { method: "POST", body: JSON.stringify({ name, event }) }));
  },
  async deleteSession(id) {
    await serverApi(`/api/sessions/${id}`, { method: "DELETE" });
  },
  async listSolves(session_id) {
    const rows = (await serverApi(`/api/sessions/${session_id}/solves`)).map(mapSolve);
    return applyPending(session_id, rows);
  },
  async createSolve({ session_id, scramble, time_ms, penalty }) {
    const v = {
      id: uuid(),
      session_id,
      scramble,
      time_ms,
      penalty,
      adjusted_ms: adjustedMs(time_ms, penalty),
      solved_at: new Date().toISOString(),
    };
    enqueue({ kind: "create", client_id: v.id, session_id, scramble, time_ms, penalty, solved_at: v.solved_at });
    mirrorSolveToLocal(v);
    scheduleFlush();
    return v;
  },
  async patchSolve(id, penalty) {
    const v = localSolve(id) || { id, time_ms: 0, penalty: "NONE" };
    v.penalty = penalty;
    v.adjusted_ms = adjustedMs(v.time_ms, penalty);
    const d = loadLocal();
    const copy = (d.solves || []).find((x) => x.id === id);
    if (copy) {
      copy.penalty = penalty;
      copy.adjusted_ms = v.adjusted_ms;
      saveLocal(d);
    }
    enqueue({ kind: "patch", client_id: id, penalty });
    scheduleFlush();
    return { ...v, id };
  },
  async deleteSolve(id) {
    const d = loadLocal();
    d.solves = (d.solves || []).filter((v) => v.id !== id);
    saveLocal(d);
    enqueue({ kind: "delete", client_id: id });
    scheduleFlush();
  },
};

/* ---------------- pending queue flush ---------------- */

async function sendOp(op) {
  if (op.kind === "create") {
    const res = await serverApi("/api/solves", {
      method: "POST",
      body: JSON.stringify({
        session_client_id: op.session_id,
        client_id: op.client_id,
        scramble: op.scramble,
        time_ms: op.time_ms,
        penalty: op.penalty,
      }),
      keepalive: op.keepalive,
    });
    const d = loadLocal();
    const copy = (d.solves || []).find((s) => s.id === op.client_id);
    if (copy && res) {
      copy.solved_at = res.solved_at || copy.solved_at;
      copy.penalty = res.penalty;
      copy.adjusted_ms = res.adjusted_ms;
      saveLocal(d);
    }
    return;
  }
  if (op.kind === "patch") {
    await serverApi(`/api/solves/${op.client_id}`, {
      method: "PATCH",
      body: JSON.stringify({ penalty: op.penalty }),
      keepalive: op.keepalive,
    });
    return;
  }
  await serverApi(`/api/solves/${op.client_id}`, {
    method: "DELETE",
    keepalive: op.keepalive,
  });
}

async function flushOnce(opts = {}) {
  for (;;) {
    const ops = loadPending();
    if (!ops.length) return;
    const op = ops[0];
    try {
      await sendOp({ ...op, keepalive: !!opts.keepalive });
    } catch (err) {
      if (err && err.status === 404) {
        if (op.kind === "delete") {
          ops.shift();
          savePending(ops);
          notifySync();
          continue;
        }
        const hasLaterDelete = ops
          .slice(1)
          .some((candidate) => candidate.client_id === op.client_id && candidate.kind === "delete");
        if (hasLaterDelete) {
          // A locally deleted row no longer needs an unsynced create or patch.
          savePending(ops.filter((candidate) => candidate.client_id !== op.client_id));
          notifySync();
          continue;
        }
        // Keep creates and patches for a later sign-in or retry.
        flushBlocked = true;
        notifySync();
        return;
      }
      return;
    }
    ops.shift();
    savePending(ops);
    notifySync();
  }
}

let flushChain = Promise.resolve();

function scheduleFlush(opts) {
  if (mode !== "server" || !token || flushBlocked) return;
  flushChain = flushChain.then(() => flushOnce(opts)).catch(() => {});
}

const syncListeners = new Set();

function notifySync() {
  for (const cb of syncListeners) {
    try {
      cb();
    } catch (err) {
      /* ignore */
    }
  }
}

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
  pendingCount() {
    return loadPending().length;
  },
  onSync(cb) {
    syncListeners.add(cb);
  },
  solveActivity() {
    const d = loadLocal();
    const map = {};
    for (const v of d.solves || []) {
      const ts = v.solved_at || "";
      if (ts && (!map[v.session_id] || ts > map[v.session_id])) {
        map[v.session_id] = ts;
      }
    }
    return map;
  },
};

/* ---------------- auth + sync ---------------- */

async function mergeLocalToServer() {
  const d = loadLocal();
  const serverSessions = await server.listSessions();
  const mergeMap = new Map();
  const localSessions = Array.isArray(d.sessions) ? d.sessions : [];
  const unmatchedLocal = localSessions.filter(
    (s) => s.id && !serverSessions.some((x) => x.id && x.id === s.id)
  );
  const unmatchedServer = serverSessions.filter(
    (s) => s.id && !localSessions.some((x) => x.id && x.id === s.id)
  );
  const localGroups = new Map();
  const serverGroups = new Map();
  function addToGroup(groups, s) {
    if (!s.created_at) return;
    const key = JSON.stringify([s.name, s.event, s.created_at]);
    const group = groups.get(key) || [];
    group.push(s);
    groups.set(key, group);
  }
  for (const s of unmatchedLocal) addToGroup(localGroups, s);
  for (const s of unmatchedServer) addToGroup(serverGroups, s);
  // Client IDs are authoritative; timestamp matching is only for unambiguous legacy rows.
  for (const [key, localGroup] of localGroups) {
    const serverGroup = serverGroups.get(key) || [];
    if (localGroup.length === 1 && serverGroup.length === 1) {
      mergeMap.set(localGroup[0].id, serverGroup[0].id);
    }
  }
  const sessions = [];
  for (const s of localSessions) {
    if (mergeMap.has(s.id)) continue;
    sessions.push({
      client_id: s.id,
      name: s.name,
      event: s.event,
      created_at: s.created_at,
    });
  }
  const solves = [];
  for (const v of d.solves || []) {
    const mapped = mergeMap.get(v.session_id);
    if (mapped) {
      solves.push({
        client_id: v.id,
        session_client_id: mapped,
        scramble: v.scramble,
        time_ms: v.time_ms,
        penalty: v.penalty,
        solved_at: v.solved_at,
      });
    } else {
      solves.push({
        client_id: v.id,
        session_client_id: v.session_id,
        scramble: v.scramble,
        time_ms: v.time_ms,
        penalty: v.penalty,
        solved_at: v.solved_at,
      });
    }
  }
  const res = await serverApi("/api/sync", {
    method: "POST",
    body: JSON.stringify({
      sessions,
      solves,
      deleted_sessions: (d.deletedSessions || []).map((id) => mergeMap.get(id) || id),
      deleted_solves: d.deletedSolves || [],
    }),
  });
  const reconciled = reconcileServerState(
    res.sessions.map(mapSession),
    res.solves.map(mapSolve)
  );
  // The sync response has acknowledged both tombstone lists.
  delete reconciled.deletedSessions;
  delete reconciled.deletedSolves;
  saveLocal(reconciled);
  setReady();
}

async function pullServerState() {
  const state = await loadServerState();
  const reconciled = reconcileServerState(state.sessions, state.solves);
  saveLocal(reconciled);
  setReady();
  return reconciled;
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
  flush(opts) {
    scheduleFlush(opts);
  },
  async init() {
    flushBlocked = false;
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
      if (code) {
        try {
          await mergeLocalToServer();
        } catch (err) {
          /* keep local data as-is */
        }
      } else {
        try {
          await flushOnce();
        } catch (err) {
          /* keep pending */
        }
        let reconciled = false;
        try {
          reconciled = localStorage.getItem(READY_KEY) === "1";
        } catch (err) {
          /* ignore */
        }
        if (reconciled) {
          try {
            await pullServerState();
          } catch (err) {
            /* keep previous cache */
          }
        } else {
          try {
            await mergeLocalToServer();
          } catch (err) {
            /* keep local data as-is; retry next boot */
          }
        }
      }
      scheduleFlush();
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
      await flushOnce();
    } catch (err) {
      /* keep local as-is */
    }
    try {
      const d = await loadServerState();
      saveLocal(reconcileServerState(d.sessions, d.solves));
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

async function loadServerState() {
  const sessions = await server.listSessions();
  const solves = [];
  for (const s of sessions) {
    solves.push(...(await server.listSolves(s.id)));
  }
  return { sessions, solves };
}
