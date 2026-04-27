// server/server.js
// Chạy: node server.js [PORT]
// Mặc định PORT = 8080

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const os = require("os");

const PORT = process.env.PORT || parseInt(process.argv[2], 10) || 8080;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(__dirname + "/public"));

let clients = new Map(); // ws => { id, lastClientTime, offset, lastSeen }

// Utility: now
function nowMs() {
  return Date.now();
}

// Generate simple client id
let nextId = 1;
function genId() {
  return `C${nextId++}`;
}

// Broadcast helper
function broadcastJSON(obj) {
  const s = JSON.stringify(obj);
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(s);
  }
} 

wss.on("connection", (ws, req) => {
  const id = genId();
  clients.set(ws, {
    id,
    lastClientTime: null,
    offset: null,
    lastSeen: Date.now(),
  });
  console.log(`[+] Client connected: ${id} - ${req.socket.remoteAddress}`);

  // Send welcome
  ws.send(JSON.stringify({ type: "WELCOME", id, serverTime: nowMs() }));

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString()); 
      const meta = clients.get(ws);
      meta.lastSeen = Date.now();
      
      if (data.type === "CLIENT_TIME") {
        meta.lastClientTime = data.time; // client local time reported
        meta.offset = data.time - nowMs(); // positive: client ahead of server
        console.log(
          `[i] ${meta.id} reported time ${new Date(
            data.time
          ).toISOString()} offset=${meta.offset}ms`
        );
      }
    } catch (err) {
      console.error("Bad message:", err);
    }
  });

  ws.on("close", () => {
    const meta = clients.get(ws) || {};
    console.log(`[-] Client disconnected: ${meta.id || "unknown"}`);
    clients.delete(ws);
  });
});

// Endpoint HTTP để trigger đồng bộ thủ công (hữu ích cho debug)
app.get("/sync", (req, res) => {
  if (clients.size === 0) {
    return res.send({ ok: false, msg: "No clients connected" });
  }

  // Request times from clients
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "REQUEST_TIME" }));
    }
  }

  // Wait 1.5s để client phản hồi, sau đó tính toán
  setTimeout(() => {
    // Compute offsets: include server as offset 0
    const offsets = [0];
    const entries = [];

    for (const [ws, meta] of clients.entries()) {
      if (typeof meta.offset === "number") {
        offsets.push(meta.offset);
        entries.push(meta);
      } else {
        entries.push(meta); // may be missing time
      }
    }

    // average offset
    const avg = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    const serverNewTime = nowMs() + avg;

    // For each client calculate adjust = newTime - clientTime
    const adjustments = [];
    for (const [ws, meta] of clients.entries()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const clientTime =
        typeof meta.lastClientTime === "number" ? meta.lastClientTime : nowMs();
      const adjust = Math.round(serverNewTime - clientTime);
      ws.send(JSON.stringify({ type: "ADJUST_TIME", adjust, serverNewTime }));
      adjustments.push({ id: meta.id, adjust });
      console.log(`[->] Sent ADJUST to ${meta.id}: ${adjust} ms`);
    }

    res.send({ ok: true, avgOffset: avg, serverNewTime, adjustments });
  }, 1500);
}); 

// Auto sync interval (configurable)
const AUTO_SYNC_MS = 10000;
setInterval(() => {
  if (clients.size === 0) return;
  console.log("\n--- Auto sync triggered ---");
  // trigger same flow as /sync
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "REQUEST_TIME" }));
  }
  setTimeout(() => {
    const offsets = [0];
    for (const meta of clients.values()) {
      if (typeof meta.offset === "number") offsets.push(meta.offset);
    }
    const avg = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    const serverNewTime = nowMs() + avg;
    for (const [ws, meta] of clients.entries()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const clientTime =
        typeof meta.lastClientTime === "number" ? meta.lastClientTime : nowMs();
      const adjust = Math.round(serverNewTime - clientTime);
      ws.send(JSON.stringify({ type: "ADJUST_TIME", adjust, serverNewTime }));
      console.log(`[->] ${meta.id} adjust=${adjust}ms`);
    }
  }, 1500);
}, AUTO_SYNC_MS);

server.listen(PORT, "0.0.0.0", () => {
  const ifaces = os.networkInterfaces();
  console.log(`Server listening on port ${PORT}`);
  console.log("Open the client at: http://<server-ip>:" + PORT + "/");
  console.log("Network interfaces:");
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (!iface.internal && iface.family === "IPv4") {
        console.log(` - ${name}: http://${iface.address}:${PORT}/`);
      }
    }
  }
});
