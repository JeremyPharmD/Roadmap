const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const port = Number(process.env.PORT) || 8080;

function fileFor(urlPath) {
  try {
    const pathname = decodeURIComponent(new URL(urlPath, "http://127.0.0.1").pathname);
    const relative = (pathname === "/" ? "index.html" : pathname).replace(/^\/+/, "");
    const file = path.resolve(root, relative);
    if (file !== root && !file.startsWith(root + path.sep)) return null;
    return file;
  } catch (error) {
    return null;
  }
}

const server = http.createServer((req, res) => {
  let file;
  try {
    file = fileFor(req.url || "/");
  } catch (error) {
    file = null;
  }
  if (!file) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }
  fs.readFile(file, (error, body) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": types[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(body);
  });
});

server.listen(port, "0.0.0.0");
