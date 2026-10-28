import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { FeedbackProvider } from './components/Feedback';
import { Layout } from './components/Layout';
import { PLAN_PATH } from './config';
import { SettingsProvider } from './hooks/settings';
import { ExercisesPage } from './pages/ExercisesPage';
import { ImportPage } from './pages/ImportPage';
import { RoutineEditorPage } from './pages/RoutineEditorPage';
import { SessionPage } from './pages/SessionPage';
import { SettingsPage } from './pages/SettingsPage';
import { HistoryPage } from './pages/WorkoutLogPage';
import { SharePage } from './pages/SharePage';
import { WorkoutEditorPage } from './pages/WorkoutEditorPage';

export function App() {
  return (
    <FeedbackProvider>
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              {/* The bottom-tab pages are drawn by Layout's TabPager (pages/tabPages.tsx); these only match their URLs. */}
              <Route index element={null} />
              <Route path="workouts" element={null} />
              <Route path="edit" element={<Navigate to={PLAN_PATH} replace />} />
              <Route path="edit/workouts/:id" element={<WorkoutEditorPage />} />
              <Route path="edit/routines/:id" element={<RoutineEditorPage />} />
              <Route path="edit/exercises" element={<ExercisesPage />} />
              <Route path="edit/import" element={<ImportPage />} />
              <Route path="check-in" element={null} />
              <Route path="session/:id" element={<SessionPage />} />
              <Route path="share" element={<SharePage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="analytics" element={null} />
              <Route path="log" element={null} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
    </FeedbackProvider>
  );
}
