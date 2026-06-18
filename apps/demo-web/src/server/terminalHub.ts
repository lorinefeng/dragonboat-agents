type TerminalSubscriber = (chunk: string) => void;

function terminalKey(runId: string, agentId: string) {
  return `${runId}:${agentId}`;
}

export class TerminalHub {
  private readonly buffers = new Map<string, string[]>();
  private readonly subscribers = new Map<string, Set<TerminalSubscriber>>();
  private readonly maxBufferLines: number;

  constructor(options: { maxBufferLines?: number } = {}) {
    this.maxBufferLines = options.maxBufferLines ?? 600;
  }

  append(runId: string, agentId: string, chunk: string) {
    const key = terminalKey(runId, agentId);
    const nextBuffer = [...(this.buffers.get(key) ?? []), chunk];

    this.buffers.set(key, nextBuffer);

    for (const subscriber of this.subscribers.get(key) ?? []) {
      subscriber(chunk);
    }
  }

  snapshot(runId: string, agentId: string) {
    return (this.buffers.get(terminalKey(runId, agentId)) ?? []).join("");
  }

  subscribe(runId: string, agentId: string, subscriber: TerminalSubscriber) {
    const key = terminalKey(runId, agentId);
    const current = this.subscribers.get(key) ?? new Set<TerminalSubscriber>();
    this.subscribers.set(key, current);
    current.add(subscriber);

    for (const chunk of this.buffers.get(key) ?? []) {
      subscriber(chunk);
    }

    return () => {
      current.delete(subscriber);
    };
  }
}
