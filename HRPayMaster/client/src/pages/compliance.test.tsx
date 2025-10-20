import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { FleetExpiry } from './compliance';
import '@testing-library/jest-dom';
import '@/lib/i18n';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
  toast,
}));

const originalFetch = global.fetch;

describe('FleetExpiry registration replacement', () => {
  beforeEach(() => {
    queryClient.clear();
    toast.mockReset();

    let replaced = false;

    global.fetch = vi.fn(async (url: any, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/fleet/expiry-check')) {
        const data = replaced
          ? [
              {
                carId: 'car-1',
                make: 'Toyota',
                model: 'Camry',
                year: 2020,
                plateNumber: 'ABC123',
                registrationExpiry: '2025-01-01',
                daysUntilRegistrationExpiry: 120,
                status: 'available',
                assignedEmployeeName: null,
                registrationOwner: 'Fleet Co',
              },
            ]
          : [
              {
                carId: 'car-1',
                make: 'Toyota',
                model: 'Camry',
                year: 2020,
                plateNumber: 'ABC123',
                registrationExpiry: '2024-05-01',
                daysUntilRegistrationExpiry: -5,
                status: 'available',
                assignedEmployeeName: null,
                registrationOwner: 'Fleet Co',
              },
            ];

        return {
          ok: true,
          status: 200,
          json: async () => data,
          headers: { get: () => null },
        } as any;
      }

      if (typeof url === 'string' && url.startsWith('/api/cars/') && init?.method === 'PUT') {
        replaced = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'car-1' }),
          headers: { get: () => null },
        } as any;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        headers: { get: () => null },
      } as any;
    }) as any;
  });

  afterEach(() => {
    queryClient.clear();
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete (global as any).fetch;
    }
  });

  it('updates registration details and clears expired status', async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <FleetExpiry />
      </QueryClientProvider>
    );

    await screen.findByText('Expired 5 days ago');

    const replaceButton = screen.getByRole('button', { name: /replace registration/i });
    await user.click(replaceButton);

    const dateInput = await screen.findByLabelText(/new expiry date/i);
    fireEvent.change(dateInput, { target: { value: '2025-01-01' } });

    const fileInput = await screen.findByLabelText(/new registration document/i);
    const file = new File(['pdf'], 'registration.pdf', { type: 'application/pdf' });
    await user.upload(fileInput, file);

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/cars\/car-1/),
        expect.objectContaining({ method: 'PUT' })
      )
    );

    await waitFor(() => expect(screen.queryByText('Expired 5 days ago')).not.toBeInTheDocument());
    await screen.findByText('Current');

    expect(screen.queryByRole('button', { name: /replace registration/i })).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Registration updated' }));
  });
});
