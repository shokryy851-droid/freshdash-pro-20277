import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { AppError } from '@/lib/errors';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Retry only transport failures; permission/validation errors are final
      retry: (count, err) => count < 2 && (!(err instanceof AppError) || err.retryable)
    },
    mutations: { retry: false }
  }
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
