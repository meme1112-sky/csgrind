const app = require("./app");
const config = require("./config");

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`Backend running: http://localhost:${config.port}/`);
  console.log(`Proxy /v1 -> ${config.extraBackend.url}`);
  if (!config.faceit.apiKey) {
    console.warn("FACEIT_KEY not set; FACEIT endpoints will return 500.");
  }
});

module.exports = server;
