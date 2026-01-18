
import { AppState, Notebook, Source, ChatMessage } from "../types";

const STORAGE_KEY = 'notebook_ai_state';

export const storageService = {
  saveState: (state: AppState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  },

  loadState: (): AppState => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return {
        notebooks: [],
        sources: [],
        activeNotebookId: null,
        messages: {},
      };
    }
    return JSON.parse(saved);
  },

  clear: () => {
    localStorage.removeItem(STORAGE_KEY);
  }
};
