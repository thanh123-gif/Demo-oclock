// client.js
// Berkeley Clock - Client

const WS_URL = `ws://${window.location.hostname}:${location.port || 8080}`;

let ws;
let clientId = "-";
let offset = 0; // ms: clientTime = Date.now() + offset
let lastAdjust = 0;

// DOM
const $clock = document.getElementById("clock");
const $offsetText = document.getElementById("offsetText");
const $status = document.getElementById("status");
const $serverTime = document.getElementById("serverTime");
const $lastSync = document.getElementById("lastSync");
const $logs = document.getElementById("logs");
const $clientId = document.getElementById("clientId");

// Log helper
function log(msg) {
  const time = new Date().toLocaleTimeString();
  $logs.innerHTML = `<div>[${time}] ${msg}</div>` + $logs.innerHTML;
}

// Update client clock UI 
function updateClockUI() {
  const t = new Date(Date.now() + offset);
  $clock.textContent = t.toLocaleTimeString();
  $offsetText.textContent = `Offset: ${offset} ms`;
}
setInterval(updateClockUI, 1000);

// Connect WebSocket
function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    $status.textContent = "Connected";
    $status.className = "text-lg mt-2 text-emerald-700";
    log("WebSocket connected: " + WS_URL);
  };

  ws.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);

      switch (data.type) {
        case "WELCOME":
          clientId = data.id;
          $clientId.textContent = "ID: " + clientId;
          $serverTime.textContent = new Date(
            data.serverTime
          ).toLocaleTimeString();
          log(
            `WELCOME (serverTime=${new Date(
              data.serverTime
            ).toLocaleTimeString()})`
          );
          break;

        case "REQUEST_TIME":
          // Server yêu cầu client gửi thời gian
          const myTime = Date.now() + offset;
          ws.send(JSON.stringify({ type: "CLIENT_TIME", time: myTime }));
          log("Sent CLIENT_TIME: " + new Date(myTime).toLocaleTimeString());
          break;

        case "ADJUST_TIME":
          // Server gửi điều chỉnh theo Berkeley
          lastAdjust = data.adjust;
          offset += data.adjust;

          $serverTime.textContent = new Date(
            data.serverNewTime
          ).toLocaleTimeString();
          $lastSync.textContent = new Date().toLocaleString();

          log(`ADJUST_TIME received: ${data.adjust} ms`);
          break;
      }
    } catch (err) {
      console.error("Bad message", err);
    }
  };

  ws.onclose = () => {
    $status.textContent = "Disconnected";
    $status.className = "text-lg mt-2 text-rose-600";
    log("WebSocket disconnected – retry in 3s");
    setTimeout(connect, 3000);
  };

  ws.onerror = (err) => {
    console.error("WebSocket error", err);
  };
}

// Start
connect();

// Manual buttons
document.getElementById("btnReq").addEventListener("click", () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({ type: "CLIENT_TIME", time: Date.now() + offset })
    );
    log("Manual CLIENT_TIME sent");
  } else {
    log("WebSocket not connected");
  }
});

document.getElementById("btnAdjust").addEventListener("click", () => {
  offset += lastAdjust;
  log("Applied last adjust again: " + lastAdjust + " ms");
});
