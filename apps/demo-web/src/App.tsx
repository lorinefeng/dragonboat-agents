import {
  Activity,
  CheckCircle2,
  GitBranch,
  RadioTower,
  Send,
  ShieldCheck,
  TerminalSquare
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { httpDemoApiClient, type DemoApiClient, type DemoRun } from "./client/demoApiClient";

interface AppProps {
  api?: DemoApiClient;
}

const CONTRACT_MESSAGE = "GET /api/run returns crew, tasks, mailbox, and evidence arrays.";

function platformLabel(platform: string) {
  return platform === "codex_cli" ? "Codex CLI" : "Claude Code CLI";
}

function CrewPanel({ run }: { run: DemoRun }) {
  const members = [run.crew.steerer, ...run.crew.rowers];

  return (
    <section className="panel crew-panel" aria-labelledby="crew-heading">
      <div className="panel-heading">
        <RadioTower aria-hidden="true" />
        <h2 id="crew-heading">Crew</h2>
      </div>
      <div className="crew-list">
        {members.map((member) => (
          <article className="crew-row" key={member.id}>
            <div>
              <h3>{member.name}</h3>
              <p>
                {platformLabel(member.platform)} / {member.role}
              </p>
            </div>
            <span className="status-chip">{member.status}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function TaskBoard({ run }: { run: DemoRun }) {
  return (
    <section className="panel task-panel" aria-labelledby="tasks-heading">
      <div className="panel-heading">
        <GitBranch aria-hidden="true" />
        <h2 id="tasks-heading">Task Graph</h2>
      </div>
      <div className="task-grid">
        {run.tasks.map((task) => (
          <article className="task-row" key={task.id}>
            <div className="task-topline">
              <span>{task.lane}</span>
              <span className="status-chip">{task.status}</span>
            </div>
            <h3>{task.title}</h3>
            <div className="progress-track" aria-label={`${task.title} progress`}>
              <span style={{ width: `${task.progress}%` }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MailboxPanel({ run }: { run: DemoRun }) {
  return (
    <section className="panel mailbox-panel" aria-labelledby="mailbox-heading">
      <div className="panel-heading">
        <TerminalSquare aria-hidden="true" />
        <h2 id="mailbox-heading">Mailbox Timeline</h2>
      </div>
      <div className="timeline">
        {run.mailbox.map((message) => (
          <article className="timeline-item" key={message.id}>
            <div className="timeline-meta">
              <span>{message.type}</span>
              <span>
                {message.from} to {message.to}
              </span>
            </div>
            <p>{message.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function EvidencePanel({ run }: { run: DemoRun }) {
  return (
    <section className="panel evidence-panel" aria-labelledby="evidence-heading">
      <div className="panel-heading">
        <ShieldCheck aria-hidden="true" />
        <h2 id="evidence-heading">Evidence Queue</h2>
      </div>
      {run.evidence.map((item) => (
        <article className="evidence-row" key={item.id}>
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h3>{item.title}</h3>
            <p>
              {item.taskId} / {item.status}
            </p>
          </div>
        </article>
      ))}
    </section>
  );
}

export function App({ api = httpDemoApiClient }: AppProps) {
  const [run, setRun] = useState<DemoRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    let isMounted = true;

    api
      .loadRun()
      .then((nextRun) => {
        if (isMounted) {
          setRun(nextRun);
        }
      })
      .catch((cause: unknown) => {
        if (isMounted) {
          setError(cause instanceof Error ? cause.message : "Unable to load run.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [api]);

  const recordContract = useCallback(async () => {
    setIsSending(true);
    setError(null);

    try {
      const nextRun = await api.sendMessage({
        from: "agent_backend",
        to: "agent_frontend",
        taskId: "task_backend",
        type: "contract",
        body: CONTRACT_MESSAGE
      });
      setRun(nextRun);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record handoff.");
    } finally {
      setIsSending(false);
    }
  }, [api]);

  if (error && !run) {
    return (
      <main className="app-shell">
        <section className="panel empty-state">
          <h1>DragonBoat Crew Run</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!run) {
    return (
      <main className="app-shell">
        <section className="panel empty-state">
          <Activity aria-hidden="true" />
          <h1>Loading DragonBoat run</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p>DragonBoat demo</p>
          <h1>Crew Run Command Board</h1>
        </div>
        <div className="run-actions">
          <span>{run.runId}</span>
          <button disabled={isSending} onClick={recordContract} type="button">
            <Send aria-hidden="true" />
            Record backend contract
          </button>
        </div>
      </header>

      {error ? <p className="inline-error">{error}</p> : null}

      <div className="dashboard-grid">
        <CrewPanel run={run} />
        <TaskBoard run={run} />
        <MailboxPanel run={run} />
        <EvidencePanel run={run} />
      </div>
    </main>
  );
}
