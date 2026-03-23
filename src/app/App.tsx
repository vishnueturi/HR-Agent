import { useEffect } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { RouterProvider } from 'react-router';
import { store } from './store';
import { router } from './routes';
import { initializeTheme } from './store/themeSlice';
import { bootstrapHrmsAccessTokenFromUrl } from './backend/config';

function ThemeInitializer() {
  const dispatch = useDispatch();
  
  useEffect(() => {
    dispatch(initializeTheme());
    bootstrapHrmsAccessTokenFromUrl();
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
