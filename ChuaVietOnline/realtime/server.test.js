"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { WebSocket } = require("ws");

const port = 18888;
const server = spawn(process.execPath, ["server.js"], {
  cwd: __dirname,
  env: {...process.env, PORT: String(port)},
  stdio: ["ignore", "pipe", "pipe"]
});
process.on("exit", () => server.kill());
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function connect() {
  for (let attempt=0;attempt<30;attempt++) {
    try {
      return await new Promise((resolve,reject)=>{
        const ws=new WebSocket("ws://127.0.0.1:"+port);
        ws._testQueue=[];
        ws.on("message",raw=>ws._testQueue.push(JSON.parse(String(raw))));
        ws.once("open",()=>resolve(ws));
        ws.once("error",reject);
      });
    } catch {await delay(100);}
  }
  throw Error("Server failed to start");
}
function messages(ws) {
  const queue=ws._testQueue;
  return async (type,timeout=2500)=>{
    const end=Date.now()+timeout;
    while(Date.now()<end){
      const i=queue.findIndex(x=>x.type===type);
      if(i>=0)return queue.splice(i,1)[0];
      await delay(30);
    }
    throw Error("Missing message: "+type);
  };
}
test("two players cannot reserve the same cushion; released seats can be reused",async()=>{
  const a=await connect(),b=await connect();
  const nextA=messages(a),nextB=messages(b);
  try {
    const welcomeA=await nextA("welcome");
    const welcomeB=await nextB("welcome");
    assert.notEqual(welcomeA.id,welcomeB.id);
    a.send(JSON.stringify({type:"seat",seat:42}));
    assert.equal((await nextA("seat_ok")).seat,42);
    b.send(JSON.stringify({type:"seat",seat:42}));
    assert.equal((await nextB("seat_denied")).reason,"occupied");
    a.send(JSON.stringify({type:"seat",seat:-1}));
    assert.equal((await nextA("seat_ok")).seat,-1);
    b.send(JSON.stringify({type:"seat",seat:42}));
    assert.equal((await nextB("seat_ok")).seat,42);
    b.send(JSON.stringify({type:"seat",seat:1000}));
    await delay(100);
    b.send(JSON.stringify({type:"seat",seat:-1}));
    assert.equal((await nextB("seat_ok")).seat,-1);
  } finally {a.close();b.close();}
});
