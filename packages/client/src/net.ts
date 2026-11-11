// The WebSocket link to the server (DESIGN.md 12.1). The client sends commands
// and receives state. It reconnects on its own if the server goes away.

import type { ClientMessage, Command, CommandResult, ServerMessage } from "@groundwork/protocol";

export type LinkStatus = "connecting" | "open" | "closed";

export interface LinkHandlers {
  message(msg: ServerMessage): void;
  status(status: LinkStatus): void;
}

/** The WebSocket URL on the same host and port that served the page. */
export function socketUrl(loc: { protocol: string; host: string }): string {
  return `${loc.protocol === "https:" ? "wss" : "ws"}://${loc.host}/ws`;
}

export class Link {
  private ws: WebSocket | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, (result: CommandResult) => void>();

  constructor(
    private readonly url: string,
    private readonly handlers: LinkHandlers,
  ) {
    this.open();
  }

  private open(): void {
    this.handlers.status("connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => this.handlers.status("open");
    ws.onmessage = (ev: MessageEvent) => {
      const msg = JSON.parse(String(ev.data)) as ServerMessage;
      if (msg.type === "command_result") {
        this.pending.get(msg.id)?.(msg.result);
        this.pending.delete(msg.id);
      }
      this.handlers.message(msg);
    };
    ws.onclose = () => {
      this.handlers.status("closed");
      for (const done of this.pending.values()) {
        done({ ok: false, error: { code: "unknown_op", message: "lost the connection" } });
      }
      this.pending.clear();
      setTimeout(() => this.open(), 1000);
    };
  }

  private send(msg: ClientMessage): boolean {
    if (this.ws === undefined || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  command(command: Command): Promise<CommandResult> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      if (!this.send({ type: "command", id, command })) {
        resolve({ ok: false, error: { code: "unknown_op", message: "not connected" } });
        return;
      }
      this.pending.set(id, resolve);
    });
  }

  setSpeed(speed: number): void {
    this.send({ type: "set_speed", speed });
  }
}
