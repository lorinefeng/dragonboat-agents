export interface User {
  id: string;
  email: string;
}

export interface Card {
  id: string;
  title: string;
}

export interface List {
  id: string;
  title: string;
  cards: Card[];
}

export interface Board {
  id: string;
  title: string;
  ownerId: string;
  lists: List[];
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface ReorderCardsInput {
  orderedCardIds: string[];
  sourceListId: string;
  targetListId: string;
}

interface StoredUser extends User {
  password: string;
}

function cloneBoard(board: Board): Board {
  return {
    ...board,
    lists: board.lists.map((list) => ({
      ...list,
      cards: list.cards.map((card) => ({ ...card }))
    }))
  };
}

function seedBoard(ownerId: string): Board {
  return {
    id: `board_${ownerId}`,
    ownerId,
    title: "Launch Board",
    lists: [
      {
        id: "list_backlog",
        title: "Backlog",
        cards: [
          { id: "card_api_contract", title: "API contract" },
          { id: "card_auth_copy", title: "Auth empty states" }
        ]
      },
      {
        id: "list_doing",
        title: "Doing",
        cards: [{ id: "card_drag_ui", title: "Drag-sort UI" }]
      },
      {
        id: "list_done",
        title: "Done",
        cards: [{ id: "card_schema", title: "Schema sketch" }]
      }
    ]
  };
}

export function createCollabStore() {
  const users = new Map<string, StoredUser>();
  const sessions = new Map<string, string>();
  const boards = new Map<string, Board>();
  let nextUserId = 1;

  function requireUser(token: string) {
    const userId = sessions.get(token);

    if (!userId) {
      throw new Error("Unauthorized.");
    }

    return userId;
  }

  function requireBoard(token: string, boardId: string) {
    const userId = requireUser(token);
    const board = boards.get(boardId);

    if (!board || board.ownerId !== userId) {
      throw new Error("Board not found.");
    }

    return board;
  }

  function createSession(user: StoredUser): AuthSession {
    const token = `token_${user.id}_${sessions.size + 1}`;
    sessions.set(token, user.id);

    return {
      token,
      user: {
        id: user.id,
        email: user.email
      }
    };
  }

  return {
    getBoard(token: string, boardId: string) {
      return cloneBoard(requireBoard(token, boardId));
    },

    listBoards(token: string) {
      const userId = requireUser(token);

      return [...boards.values()].filter((board) => board.ownerId === userId).map(cloneBoard);
    },

    login(email: string, password: string) {
      const user = users.get(email);

      if (!user || user.password !== password) {
        throw new Error("Invalid email or password.");
      }

      return createSession(user);
    },

    register(email: string, password: string) {
      if (users.has(email)) {
        throw new Error("Email already registered.");
      }

      const user: StoredUser = {
        id: `user_${nextUserId++}`,
        email,
        password
      };
      users.set(email, user);
      const board = seedBoard(user.id);
      boards.set(board.id, board);

      return createSession(user);
    },

    reorderCards(token: string, boardId: string, input: ReorderCardsInput) {
      const board = requireBoard(token, boardId);
      const source = board.lists.find((list) => list.id === input.sourceListId);
      const target = board.lists.find((list) => list.id === input.targetListId);

      if (!source || !target) {
        throw new Error("List not found.");
      }

      const cardsById = new Map(board.lists.flatMap((list) => list.cards.map((card) => [card.id, card] as const)));
      const orderedCards = input.orderedCardIds.map((cardId) => {
        const card = cardsById.get(cardId);

        if (!card) {
          throw new Error(`Card ${cardId} not found.`);
        }

        return card;
      });

      for (const list of board.lists) {
        list.cards = list.cards.filter((card) => !input.orderedCardIds.includes(card.id));
      }

      target.cards = [...orderedCards, ...target.cards];

      return cloneBoard(board);
    },

    reorderLists(token: string, boardId: string, orderedListIds: string[]) {
      const board = requireBoard(token, boardId);
      const listsById = new Map(board.lists.map((list) => [list.id, list] as const));
      const orderedLists = orderedListIds.map((listId) => {
        const list = listsById.get(listId);

        if (!list) {
          throw new Error(`List ${listId} not found.`);
        }

        return list;
      });

      board.lists = [...orderedLists, ...board.lists.filter((list) => !orderedListIds.includes(list.id))];

      return cloneBoard(board);
    }
  };
}
