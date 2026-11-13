import type { RouteObject } from 'react-router';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { AgendaPage } from './pages/panel/AgendaPage';
import { PanelHome } from './pages/panel/PanelHome';
import { BookingPage } from './pages/public/BookingPage';
import { RegisterPage } from './pages/RegisterPage';
import { RequireAuth } from './pages/RequireAuth';

export const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '/entrar', element: <LoginPage /> },
  { path: '/registro', element: <RegisterPage /> },
  { path: '/n/:slug', element: <BookingPage /> },
  {
    path: '/panel',
    element: (
      <RequireAuth>
        <PanelHome />
      </RequireAuth>
    ),
  },
  {
    path: '/panel/:businessId',
    element: (
      <RequireAuth>
        <AgendaPage />
      </RequireAuth>
    ),
  },
];
