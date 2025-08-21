import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaginationLink } from './pagination'
import '@testing-library/jest-dom'

describe('PaginationLink', () => {
  it('renders an anchor when href is provided', () => {
    render(<PaginationLink href="/test">1</PaginationLink>)
    const link = screen.getByRole('link', { name: '1' })
    expect(link).toHaveAttribute('href', '/test')
  })

  it('renders a button when href is not provided and supports keyboard activation', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<PaginationLink onClick={onClick}>1</PaginationLink>)
    const button = screen.getByRole('button', { name: '1' })
    await user.click(button)
    button.focus()
    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('applies aria-current when active', () => {
    const { rerender } = render(
      <PaginationLink href="/active" isActive>
        1
      </PaginationLink>
    )
    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page')
    rerender(
      <PaginationLink isActive>
        1
      </PaginationLink>
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-current', 'page')
  })
})
