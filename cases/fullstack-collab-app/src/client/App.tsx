import { useMemo, useState } from "react";
import type { Board, Card, List } from "../domain/appState";
import { createCollabApi, type CollabApi } from "../server/api";
import "./styles.css";

interface AppProps {
  api?: CollabApi;
}

function findCard(board: Board, title: string) {
  for (const list of board.lists) {
    const card = list.cards.find((candidate) => candidate.title === title);

    if (card) {
      return {
        card,
        list
      };
    }
  }

  throw new Error(`Card ${title} not found.`);
}

function BoardList({ list, onMoveApiContract }: { list: List; onMoveApiContract: () => void }) {
  return (
    <section aria-label={list.title} className="kanban-list">
      <div className="list-heading">
        <h2>{list.title}</h2>
        <span>{list.cards.length}</span>
      </div>
      <div className="card-stack">
        {list.cards.map((card: Card) => (
          <article className="work-card" draggable key={card.id}>
            <strong>{card.title}</strong>
            {card.title === "API contract" && list.id !== "list_doing" ? (
              <button onClick={onMoveApiContract} type="button">
                Move API contract to Doing
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export function App({ api: providedApi }: AppProps) {
  const api = useMemo(() => providedApi ?? createCollabApi(), [providedApi]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");

  async function createAccount() {
    setError("");

    try {
      const session = await api.register(email, password);
      const [nextBoard] = await api.listBoards(session.token);
      setToken(session.token);
      setBoard(nextBoard);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create account.");
    }
  }

  async function moveApiContractToDoing() {
    if (!board || !token) {
      return;
    }

    const { card, list: sourceList } = findCard(board, "API contract");
    const targetList = board.lists.find((list) => list.id === "list_doing");

    if (!targetList) {
      return;
    }

    const nextBoard = await api.reorderCards(token, board.id, {
      orderedCardIds: [card.id, ...targetList.cards.map((targetCard) => targetCard.id)],
      sourceListId: sourceList.id,
      targetListId: targetList.id
    });
    setBoard(nextBoard);
  }

  if (!board) {
    return (
      <main className="case-shell">
        <section className="auth-panel">
          <p>DragonBoat fullstack case</p>
          <h1>Project Collaboration</h1>
          <label>
            Email
            <input onChange={(event) => setEmail(event.target.value)} value={email} />
          </label>
          <label>
            Password
            <input onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
          </label>
          {error ? <strong className="error">{error}</strong> : null}
          <button onClick={createAccount} type="button">
            Create account
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="case-shell">
      <header className="case-header">
        <div>
          <p>Authenticated workspace</p>
          <h1>{board.title}</h1>
        </div>
        <span>{email}</span>
      </header>
      <div className="kanban-board">
        {board.lists.map((list) => (
          <BoardList key={list.id} list={list} onMoveApiContract={moveApiContractToDoing} />
        ))}
      </div>
    </main>
  );
}
