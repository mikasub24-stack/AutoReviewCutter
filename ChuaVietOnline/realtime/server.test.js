"use strict";
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { WebSocket } = require("ws");

const port = 18888;
const server = spawn(process.execPath, ["server.js"], {
  cwd: __dirname,
  env: {...process.env, PORT: String(port)},
  stdio: ["ignore", "pipe", "pipe"]
});
after(() => server.kill());
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
    assert.equal((await nextB("seat_denied")).reason,"invalid_seat");
    b.send(JSON.stringify({type:"seat",seat:-1}));
    assert.equal((await nextB("seat_ok")).seat,-1);
    a.send(JSON.stringify({type:"seat",seat:999}));
    assert.equal((await nextA("seat_ok")).seat,999);
  } finally {a.close();b.close();}
});

test("disconnect releases cushion and informs remaining player",async()=>{
  const a=await connect(),b=await connect();
  const nextA=messages(a),nextB=messages(b);
  try {
    await nextA("welcome");
    await nextB("welcome");
    a.send(JSON.stringify({type:"seat",seat:317}));
    assert.equal((await nextA("seat_ok")).seat,317);
    a.close();
    await nextB("leave");
    b.send(JSON.stringify({type:"seat",seat:317}));
    assert.equal((await nextB("seat_ok")).seat,317);
  } finally {a.terminate();b.terminate();}
});

test("reject malformed and out-of-range seats without disconnecting player",async()=>{
  const a=await connect(),next=messages(a);
  try {
    await next("welcome");
    for (const invalid of [-2,1000,1000000,1.5,"oops",null]) {
      a.send(JSON.stringify({type:"seat",seat:invalid}));
      assert.equal((await next("seat_denied")).reason,"invalid_seat");
    }
    a.send(JSON.stringify({type:"seat",seat:999}));
    assert.equal((await next("seat_ok")).seat,999);
  } finally {a.terminate();}
});
