"use strict";
const http = require("node:http");
const { WebSocketServer, WebSocket } = require("ws");
const PORT = Number(process.env.PORT || 8788);
const MAX_SEATS = 1000;
const MAX_CLIENTS = 1000;
const players = new Map();
let nextId = 1;
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, {"content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*"});
  res.end(JSON.stringify({service:"Chua Viet Online",online:players.size,seats:MAX_SEATS}));
});
const wss = new WebSocketServer({server:httpServer, maxPayload:2048});
function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function broadcast(obj, except=null) {
  const payload = JSON.stringify(obj);
  for (const ws of players.keys()) {
    if (ws !== except && ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}
function snapshot() {
  return [...players.values()].map(p=>({id:p.id,seat:p.seat,x:p.x,y:p.y,gender:p.gender,robe:p.robe}));
}
function occupied(seat, except) {
  for (const [ws,p] of players) if (ws !== except && p.seat === seat) return true;
  return false;
}
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on("close", () => clearInterval(heartbeat));
wss.on("connection", ws => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  if (players.size >= MAX_CLIENTS) {
    send(ws,{type:"error",reason:"room_full"}); ws.close(); return;
  }
  const player = {id:nextId++,seat:-1,x:860,y:4270,gender:0,robe:0,lastMove:0};
  players.set(ws,player);
  send(ws,{type:"welcome",id:player.id,players:snapshot(),capacity:MAX_SEATS});
  broadcast({type:"join",player},ws);
  ws.on("message", raw => {
    let msg;
    try {msg = JSON.parse(String(raw));} catch {return;}
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "seat") {
      const seat = Number(msg.seat);
      if (!Number.isInteger(seat) || seat < -1 || seat >= MAX_SEATS) return;
      if (seat !== -1 && occupied(seat,ws)) {
        send(ws,{type:"seat_denied",seat,reason:"occupied"}); return;
      }
      player.seat = seat;
      broadcast({type:"seat_update",id:player.id,seat});
      send(ws,{type:"seat_ok",seat});
    } else if (msg.type === "move") {
      const now = Date.now();
      if (now - player.lastMove < 80) return;
      const x=Number(msg.x), y=Number(msg.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x<0 || x>1720 || y<0 || y>4600) return;
      player.x=x; player.y=y; player.lastMove=now;
      player.gender=msg.gender===1?1:0;
      player.robe=msg.robe===1?1:0;
      broadcast({type:"move",id:player.id,x,y,gender:player.gender,robe:player.robe},ws);
    }
  });
  ws.on("close",()=>{players.delete(ws);broadcast({type:"leave",id:player.id});});
  ws.on("error",()=>{});
});
httpServer.listen(PORT,"0.0.0.0",()=>console.log("Temple realtime server listening on "+PORT));
