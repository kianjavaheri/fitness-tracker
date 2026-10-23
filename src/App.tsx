import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { SettingsProvider } from './hooks/settings';
import { CheckInPage } from './pages/CheckInPage';
import { EditWorkoutsPage } from './pages/EditWorkoutsPage';
import { ExercisesPage } from './pages/ExercisesPage';
import { HomePage } from './pages/HomePage';
import { ImportPage } from './pages/ImportPage';
import { RoutineEditorPage } from './pages/RoutineEditorPage';
import { SessionPage } from './pages/SessionPage';
import { SettingsPage } from './pages/SettingsPage';
import { WorkoutEditorPage } from './pages/WorkoutEditorPage';
import { WorkoutLogPage } from './pages/WorkoutLogPage';

// Charts are the heaviest dependency, so load them only when needed.
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));

export function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="workouts" element={<WorkoutLogPage />} />
              <Route path="edit" element={<EditWorkoutsPage />} />
              <Route path="edit/workouts/:id" element={<WorkoutEditorPage />} />
              <Route path="edit/routines/:id" element={<RoutineEditorPage />} />
              <Route path="edit/exercises" element={<ExercisesPage />} />
              <Route path="edit/import" element={<ImportPage />} />
              <Route path="check-in" element={<CheckInPage />} />
              <Route path="session/:id" element={<SessionPage />} />
              <Route path="history" element={<Navigate to="/workouts" replace />} />
              <Route
                path="analytics"
                element={
                  <Suspense fallback={null}>
                    <AnalyticsPage />
                  </Suspense>
                }
              />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  );
}
