const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: "127.0.0.1", port, path: urlPath }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
  });
}

test("a malformed path returns an error and the server keeps running", async () => {
  const port = 9876;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const status = await request(port, "/");
        if (status === 200) {
          ready = true;
          break;
        }
      } catch (error) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    assert.equal(ready, true);
    assert.equal(await request(port, "/%ZZ"), 400);
    assert.equal(child.exitCode, null);
    assert.equal(await request(port, "/"), 200);
    assert.equal(await request(port, "/%2e%2e%2fpackage.json"), 400);
  } finally {
    child.kill();
  }
});
