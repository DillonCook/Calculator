import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MobileSheet } from '../components/dashboard/mobile-sheet';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open sheet</button>
      <MobileSheet open={open} title="Accessible sheet" onClose={() => setOpen(false)}>
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </MobileSheet>
    </>
  );
}

describe('MobileSheet accessibility', () => {
  it('moves focus inside, traps tab navigation, closes on Escape, and restores focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const opener = screen.getByRole('button', { name: 'Open sheet' });
    await user.click(opener);

    const dialog = await screen.findByRole('dialog', { name: 'Accessible sheet' });
    const closeButton = within(dialog).getByRole('button', { name: 'Close' });
    await waitFor(() => expect(closeButton).toHaveFocus());

    const focusable = within(dialog).getAllByRole('button').filter((button) => button.tabIndex >= 0);
    focusable.at(-1)?.focus();
    await user.tab();
    expect(focusable[0]).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Accessible sheet' })).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });
});
