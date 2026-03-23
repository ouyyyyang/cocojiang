import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { request } from "node:http";

interface MessageEvent {
  payload: any;
}

export class TestWebSocketClient extends EventEmitter {
  private buffer = Buffer.alloc(0);

  constructor(private readonly socket: import("node:net").Socket) {
    super();
    socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });

    socket.on("close", () => {
      this.emit("close");
    });
  }

  static async connect(input: {
    port: number;
    path: string;
    host?: string;
  }): Promise<TestWebSocketClient> {
    const key = randomBytes(16).toString("base64");

    return await new Promise((resolve, reject) => {
      const req = request({
        host: input.host || "127.0.0.1",
        port: input.port,
        path: input.path,
        headers: {
          Connection: "Upgrade",
          Upgrade: "websocket",
          "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Key": key
        }
      });

      req.on("upgrade", (_response, socket, head) => {
        const client = new TestWebSocketClient(socket);
        if (head.length > 0) {
          client.buffer = Buffer.concat([client.buffer, head]);
          client.drain();
        }
        resolve(client);
      });

      req.on("response", (response) => {
        reject(new Error(`Unexpected response ${response.statusCode}`));
      });

      req.on("error", reject);
      req.end();
    });
  }

  async waitFor(predicate: (event: MessageEvent) => boolean, timeoutMs = 5_000): Promise<MessageEvent> {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const onMessage = (event: MessageEvent) => {
        if (!predicate(event)) {
          return;
        }

        cleanup();
        resolve(event);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.off("message", onMessage);
      };

      this.on("message", onMessage);
    });
  }

  close(): void {
    this.socket.end();
  }

  private drain(): void {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      let payloadLength = second & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (this.buffer.length < 4) {
          return;
        }

        payloadLength = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length < 10) {
          return;
        }

        if (this.buffer.readUInt32BE(2) !== 0) {
          throw new Error("Large websocket payloads are not supported in tests");
        }

        payloadLength = this.buffer.readUInt32BE(6);
        offset = 10;
      }

      if (this.buffer.length < offset + payloadLength) {
        return;
      }

      const opcode = first & 0x0f;
      const payload = this.buffer.subarray(offset, offset + payloadLength);
      this.buffer = this.buffer.subarray(offset + payloadLength);

      if (opcode === 0x1) {
        this.emit("message", {
          payload: JSON.parse(payload.toString("utf8"))
        });
      }
    }
  }
}
