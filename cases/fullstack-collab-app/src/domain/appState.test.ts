import { describe, expect, it } from "vitest";
import { createCollabStore } from "./appState";

describe("fullstack collaboration domain", () => {
  it("registers, logs in, and returns the user's boards", () => {
    const store = createCollabStore();

    const registered = store.register("mei@example.com", "dragonboat");
    const loggedIn = store.login("mei@example.com", "dragonboat");
    const boards = store.listBoards(loggedIn.token);

    expect(registered.user.email).toBe("mei@example.com");
    expect(loggedIn.user.id).toBe(registered.user.id);
    expect(boards).toHaveLength(1);
    expect(boards[0].lists.map((list) => list.title)).toEqual(["Backlog", "Doing", "Done"]);
  });

  it("reorders lists and cards, including cross-list movement", () => {
    const store = createCollabStore();
    const { token } = store.register("rower@example.com", "dragonboat");
    const [board] = store.listBoards(token);
    const [backlog, doing, done] = board.lists;
    const firstBacklogCard = backlog.cards[0];

    store.reorderLists(token, board.id, [doing.id, backlog.id, done.id]);
    store.reorderCards(token, board.id, {
      orderedCardIds: [backlog.cards[1].id],
      sourceListId: backlog.id,
      targetListId: backlog.id
    });
    store.reorderCards(token, board.id, {
      orderedCardIds: [firstBacklogCard.id, ...doing.cards.map((card) => card.id)],
      sourceListId: backlog.id,
      targetListId: doing.id
    });

    const updated = store.getBoard(token, board.id);

    expect(updated.lists.map((list) => list.id)).toEqual([doing.id, backlog.id, done.id]);
    expect(updated.lists.find((list) => list.id === doing.id)?.cards[0]).toMatchObject({
      id: firstBacklogCard.id,
      title: firstBacklogCard.title
    });
  });
});
