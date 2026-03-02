import { useEffect } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { RouterProvider } from 'react-router';
import { store } from './store';
import { router } from './routes';
import { initializeTheme } from './store/themeSlice';

function ThemeInitializer() {
  const dispatch = useDispatch();
  
  useEffect(() => {
    dispatch(initializeTheme());
  }, [dispatch]);
  
  return null;
}

export default function App() {
  return (
    <Provider store={store}>
      <ThemeInitializer />
      <RouterProvider router={router} />
    </Provider>
  );
}