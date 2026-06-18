import { createCollabStore, type ReorderCardsInput } from "../domain/appState";

export function createCollabApi() {
  const store = createCollabStore();

  return {
    getBoard(token: string, boardId: string) {
      return Promise.resolve(store.getBoard(token, boardId));
    },

    listBoards(token: string) {
      return Promise.resolve(store.listBoards(token));
    },

    login(email: string, password: string) {
      return Promise.resolve(store.login(email, password));
    },

    register(email: string, password: string) {
      return Promise.resolve(store.register(email, password));
    },

    reorderCards(token: string, boardId: string, input: ReorderCardsInput) {
      return Promise.resolve(store.reorderCards(token, boardId, input));
    },

    reorderLists(token: string, boardId: string, orderedListIds: string[]) {
      return Promise.resolve(store.reorderLists(token, boardId, orderedListIds));
    }
  };
}

export type CollabApi = ReturnType<typeof createCollabApi>;
