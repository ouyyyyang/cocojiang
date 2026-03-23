import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";

const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

interface ConnectedClient {
  id: string;
  socket: Duplex;
  buffer: Buffer;
}

export interface WebSocketHub {
  broadcast(payload: unknown): void;
  clientCount(): number;
  close(): void;
}

export function attachWebSocketServer(
  server: HttpServer,
  input: {
    path: string;
    verifyToken: (token: string | null) => boolean;
  }
): WebSocketHub {
  const clients = new Map<string, ConnectedClient>();

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "/", "http://localhost");

    if (url.pathname !== input.path) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    if (!input.verifyToken(url.searchParams.get("token"))) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    if (!isWebSocketUpgrade(request)) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    const key = request.headers["sec-websocket-key"];
    if (!key) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    const acceptKey = createHash("sha1")
      .update(`${key}${WS_MAGIC}`)
      .digest("base64");

    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${acceptKey}`,
        "\r\n"
      ].join("\r\n")
    );

    const client: ConnectedClient = {
      id: randomUUID(),
      socket,
      buffer: head
    };

    clients.set(client.id, client);

    if (head.length > 0) {
      handleIncomingFrames(client);
    }

    socket.on("data", (chunk) => {
      client.buffer = Buffer.concat([client.buffer, chunk]);
      handleIncomingFrames(client);
    });

    socket.on("close", () => {
      clients.delete(client.id);
    });

    socket.on("error", () => {
      clients.delete(client.id);
      socket.destroy();
    });
  });

  return {
    broadcast(payload: unknown): void {
      const message = Buffer.from(JSON.stringify(payload), "utf8");

      for (const client of clients.values()) {
        client.socket.write(encodeFrame(0x1, message));
      }
    },

    clientCount(): number {
      return clients.size;
    },

    close(): void {
      for (const client of clients.values()) {
        client.socket.end(encodeFrame(0x8, Buffer.alloc(0)));
      }

      clients.clear();
    }
  };

  function handleIncomingFrames(client: ConnectedClient): void {
    const parsed = decodeFrames(client.buffer);
    client.buffer = parsed.remaining;

    for (const frame of parsed.frames) {
      if (frame.opcode === 0x8) {
        client.socket.end(encodeFrame(0x8, Buffer.alloc(0)));
        clients.delete(client.id);
        return;
      }

      if (frame.opcode === 0x9) {
        client.socket.write(encodeFrame(0xA, frame.payload));
      }
    }
  }
}

function isWebSocketUpgrade(request: IncomingMessage): boolean {
  const upgrade = request.headers.upgrade?.toLowerCase();
  return upgrade === "websocket";
}

function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const payloadLength = payload.length;

  if (payloadLength < 126) {
    return Buffer.concat([Buffer.from([0x80 | opcode, payloadLength]), payload]);
  }

  if (payloadLength < 65_536) {
    const header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payloadLength, 2);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x80 | opcode;
  header[1] = 127;
  header.writeUInt32BE(0, 2);
  header.writeUInt32BE(payloadLength, 6);
  return Buffer.concat([header, payload]);
}

function decodeFrames(buffer: Buffer): {
  frames: Array<{ opcode: number; payload: Buffer }>;
  remaining: Buffer;
} {
  const frames: Array<{ opcode: number; payload: Buffer }> = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let payloadLength = second & 0x7f;
    let headerLength = 2;

    if (payloadLength === 126) {
      if (offset + 4 > buffer.length) {
        break;
      }

      payloadLength = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (payloadLength === 127) {
      if (offset + 10 > buffer.length) {
        break;
      }

      const highBits = buffer.readUInt32BE(offset + 2);
      if (highBits !== 0) {
        throw new Error("Large websocket payloads are not supported");
      }

      payloadLength = buffer.readUInt32BE(offset + 6);
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + payloadLength;
    if (offset + frameLength > buffer.length) {
      break;
    }

    const maskOffset = offset + headerLength;
    const payloadOffset = maskOffset + maskLength;
    const payload = Buffer.from(buffer.subarray(payloadOffset, payloadOffset + payloadLength));

    if (masked) {
      const mask = buffer.subarray(maskOffset, maskOffset + 4);
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }

    frames.push({ opcode, payload });
    offset += frameLength;
  }

  return {
    frames,
    remaining: buffer.subarray(offset)
  };
}
