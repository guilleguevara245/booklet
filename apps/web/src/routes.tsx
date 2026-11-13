import type { RouteObject } from 'react-router';
import { HomePage } from './pages/HomePage';
import { InvitationPage } from './pages/InvitationPage';
import { LoginPage } from './pages/LoginPage';
import { AgendaPage } from './pages/panel/AgendaPage';
import { PanelHome } from './pages/panel/PanelHome';
import { BookingPage } from './pages/public/BookingPage';
import { ManageBookingPage } from './pages/public/ManageBookingPage';
import { MyBookingsPage } from './pages/public/MyBookingsPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { RequireAuth } from './pages/RequireAuth';

export const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '/entrar', element: <LoginPage /> },
  { path: '/registro', element: <RegisterPage /> },
  { path: '/verificar', element: <VerifyEmailPage /> },
  { path: '/n/:slug', element: <BookingPage /> },
  { path: '/turno/:token', element: <ManageBookingPage /> },
  { path: '/invitacion/:token', element: <InvitationPage /> },
  {
    path: '/mis-turnos',
    element: (
      <RequireAuth>
        <MyBookingsPage />
      </RequireAuth>
    ),
  },
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
