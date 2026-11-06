import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { issueToken } from "../src/auth.js";
import { workspaceSchema } from "../src/workspace.js";
import { createPrivateExportRouter, PrivateExportBuilder, ExportLimitError } from "../src/privateExport.js";
test("private export requires authentication, derives ownership from the token and never attaches failed reads", async () => {
  const users: string[] = []; let failure: Error | undefined;
  const app = express(); app.use("/export", createPrivateExportRouter({ async read(user) { users.push(user); if (failure) throw failure; return new PrivateExportBuilder(workspaceSchema.parse({ profile: { name: user, bio: "Private" } }), "normalized", 3).finish(); } }));
  const server = app.listen(0); await new Promise<void>(r=>server.once("listening",r)); const address=server.address(); assert.ok(address&&typeof address!=="string");
  const get = (user = "", query = "") => fetch("http://127.0.0.1:"+address.port+"/export"+query, { headers: user ? { Authorization: "Bearer "+issueToken({ id:user,role:"USER" }) } : {} });
  try {
    assert.equal((await get()).status,401); assert.deepEqual(users,[]);
    const a=await get("alice"); assert.equal(a.status,200); assert.equal(a.headers.get("cache-control"),"no-store"); assert.match(a.headers.get("content-disposition")!,/attachment; filename="gamevault-private-account-/); assert.equal((await a.json()).data.workspace.profile.name,"alice");
    assert.equal((await (await get("bob")).json()).data.workspace.profile.name,"bob");
    assert.equal((await get("alice","?userId=bob")).status,400); assert.deepEqual(users,["alice","bob"]);
    for (const [error,status] of [[new ExportLimitError(),413],[new Error("DB password must not leak"),503]] as const) { failure=error; const result=await get("alice"); assert.equal(result.status,status); assert.equal(result.headers.get("content-disposition"),null); assert.doesNotMatch(await result.text(),/password/); }
  } finally { await new Promise<void>((r,e)=>server.close(x=>x?e(x):r())); }
});
test("export size accounting counts UTF-8 private fields and fails rather than truncating", () => {
  const workspace=workspaceSchema.parse({}); const initial=new PrivateExportBuilder(workspace,"normalized",0).finish();
  const limited=new PrivateExportBuilder(workspace,"normalized",0,Buffer.byteLength(initial)+10);
  assert.throws(()=>limited.journal({ id:"a",notes:"Private "+"\u00e9".repeat(30) } as any),ExportLimitError);
  const body=new PrivateExportBuilder(workspace,"legacy",null).finish(); assert.equal("journal" in JSON.parse(body).data.workspace,false); assert.deepEqual(JSON.parse(body).data.journal,[]);
});
