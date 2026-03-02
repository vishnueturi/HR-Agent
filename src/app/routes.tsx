import { createBrowserRouter } from 'react-router';
import ChatLayout from './pages/ChatLayout';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: ChatLayout,
  },
  {
    path: '/chat/:chatId?',
    Component: ChatLayout,
  },
  {
    path: '*',
    Component: ChatLayout,
  },
]);
