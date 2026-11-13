import type { RouteObject } from 'react-router';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { PanelPage } from './pages/PanelPage';
import { RegisterPage } from './pages/RegisterPage';
import { RequireAuth } from './pages/RequireAuth';

export const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '/entrar', element: <LoginPage /> },
  { path: '/registro', element: <RegisterPage /> },
  {
    path: '/panel/*',
    element: (
      <RequireAuth>
        <PanelPage />
      </RequireAuth>
    ),
  },
];
