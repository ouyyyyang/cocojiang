import { createAgentServer } from "./app.js";

const agent = await createAgentServer();
const { port, urls } = await agent.start();

console.log(`Mac Screen Agent MVP is listening on port ${port}`);
console.log(`Pairing token: ${agent.pairingToken}`);
console.log("Open one of these URLs on your phone:");
for (const url of urls) {
  console.log(`- ${url}`);
}

const shutdown = async () => {
  await agent.close();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
