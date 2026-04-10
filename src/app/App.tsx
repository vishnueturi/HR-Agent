import { useEffect } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { RouterProvider } from 'react-router';
import { store } from './store';
import { router } from './routes';
import { initializeTheme } from './store/themeSlice';
import { updateUser } from './store/userSlice';
import { bootstrapHrmsAccessTokenFromUrl } from './backend/config';
import { fetchHrBasicDetails } from './backend/hrBasicDetailsApi';

function ThemeInitializer() {
  const dispatch = useDispatch();
  
  useEffect(() => {
    dispatch(initializeTheme());
    bootstrapHrmsAccessTokenFromUrl();

    void (async () => {
      try {
        const profile = await fetchHrBasicDetails();
        if (profile) {
          dispatch(updateUser(profile));
        }
      } catch {
        // Keep placeholder user from initial state if the HR API is unavailable.
      }
    })();
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
