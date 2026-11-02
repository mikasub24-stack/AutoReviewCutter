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
test("welcome includes authoritative seated position and clothing",async()=>{
  const a=await connect(),next=messages(a);
  let b;
  try {
    const first=await next("welcome");
    a.send(JSON.stringify({type:"seat",seat:128}));
    await next("seat_ok");
    // A seated client cannot move its authoritative position until releasing its seat.
    a.send(JSON.stringify({type:"move",x:10,y:400,gender:1,robe:1}));
    await delay(110);
    b=await connect();
    const welcome=await messages(b)("welcome");
    const peer=welcome.players.find(p=>p.id===first.id);
    assert.equal(peer.seat,128);
    assert.equal(peer.x,628.5);
    assert.equal(peer.y,888);
    assert.equal(peer.gender,1);
    assert.equal(peer.robe,1);
  } finally {a.terminate();if(b)b.terminate();}
});

test("chosen Vietnamese names broadcast, survive snapshots and reject invalid names",async()=>{
  const a=await connect(),nextA=messages(a);
  let b;
  try {
    const welcome=await nextA("welcome");
    a.send(JSON.stringify({type:"profile",name:"  Diệu   Hạnh  "}));
    assert.equal((await nextA("profile")).name,"Diệu Hạnh");
    b=await connect();
    const nextB=messages(b);
    const snapshot=await nextB("welcome");
    assert.equal(snapshot.players.find(p=>p.id===welcome.id).name,"Diệu Hạnh");
    for (const name of ["", "x", "a".repeat(21), "[b]Fake[/b]", "Tên\nGiả", null]) {
      a.send(JSON.stringify({type:"profile",name}));
    }
    a.send(JSON.stringify({type:"profile",name:"An Nhiên"}));
    assert.equal((await nextB("profile")).name,"An Nhiên");
    await delay(60);
    assert.equal(b._testQueue.filter(m=>m.type==="profile").length,0);
  } finally {a.terminate();if(b)b.terminate();}
});

test("ritual poses broadcast and remain in new-player snapshots",async()=>{
  const a=await connect(),b=await connect();
  const nextA=messages(a),nextB=messages(b);
  let c;
  try {
    const welcome=await nextA("welcome");
    await nextB("welcome");
    a.send(JSON.stringify({type:"action",pose:"kneel",elapsed:0.5}));
    const kneel=await nextB("action");
    assert.equal(kneel.id,welcome.id);
    assert.equal(kneel.pose,"kneel");
    a.send(JSON.stringify({type:"action",pose:"unknown",elapsed:0}));
    a.send(JSON.stringify({type:"action",pose:"bow",elapsed:1.6}));
    assert.equal((await nextB("action")).pose,"bow");
    c=await connect();
    const snapshot=await messages(c)("welcome");
    const peer=snapshot.players.find(p=>p.id===welcome.id);
    assert.equal(peer.pose,"bow");
    assert.ok(peer.pose_elapsed>=1.6 && peer.pose_elapsed<4);
    a.send(JSON.stringify({type:"action",pose:"idle",elapsed:0}));
    assert.equal((await nextB("action")).pose,"idle");
  } finally {a.terminate();b.terminate();if(c)c.terminate();}
});
