import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ThemeState {
  isDark: boolean;
}

// Check localStorage for saved theme preference, default to dark
const getInitialTheme = (): boolean => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('theme');
    if (saved) {
      return saved === 'dark';
    }
  }
  return true; // Default to dark theme
};

const initialState: ThemeState = {
  isDark: getInitialTheme(),
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    toggleTheme: (state) => {
      state.isDark = !state.isDark;
      document.documentElement.classList.toggle('dark', state.isDark);
      localStorage.setItem('theme', state.isDark ? 'dark' : 'light');
    },
    setTheme: (state, action: PayloadAction<boolean>) => {
      state.isDark = action.payload;
      document.documentElement.classList.toggle('dark', state.isDark);
      localStorage.setItem('theme', state.isDark ? 'dark' : 'light');
    },
    initializeTheme: (state) => {
      // This action is called on app mount to set the initial theme class
      document.documentElement.classList.toggle('dark', state.isDark);
    },
  },
});

export const { toggleTheme, setTheme, initializeTheme } = themeSlice.actions;
export default themeSlice.reducer;