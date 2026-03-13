import { configureStore } from '@reduxjs/toolkit';
import themeReducer from './themeSlice';
import userReducer from './userSlice';
import chatReducer from './chatSlice';
import signalRReducer from './signalRSlice';

export const store = configureStore({
  reducer: {
    theme: themeReducer,
    user: userReducer,
    chat: chatReducer,
    signalR: signalRReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['chat/addMessage', 'chat/addAttachment'],
        // Ignore these field paths in all actions
        ignoredActionPaths: ['payload.timestamp', 'payload.createdAt', 'payload.updatedAt', 'payload.file'],
        // Ignore these paths in the state
        ignoredPaths: ['chat.chats', 'chat.attachedFiles'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
