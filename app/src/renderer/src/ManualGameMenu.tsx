import { useEffect, useId, useRef, useState } from 'react'
import type { ManualCoverSource } from '@shared/ipc/manual-channels'

export type ManualMenuAction =
  'rename' | 'args' | 'changeExe' | 'remove' | 'coverSteam' | 'coverIcon'

const EDIT_ITEMS: { action: ManualMenuAction; label: string }[] = [
  { action: 'rename', label: 'Rename' },
  { action: 'args', label: 'Launch arguments' },
  { action: 'changeExe', label: 'Change .exe' }
]

const COVER_ITEMS: { action: ManualMenuAction; source: ManualCoverSource; label: string }[] = [
  { action: 'coverSteam', source: 'steam', label: 'Steam cover' },
  { action: 'coverIcon', source: 'icon', label: 'Exe icon' }
]

interface ManualGameMenuProps {
  gameTitle: string
  // Which cover item is checked.
  coverSource: ManualCoverSource
  // The saved list can't be read: every change is off (spec).
  disabled: boolean
  onSelect: (action: ManualMenuAction, opener: HTMLButtonElement | null) => void
}

// Three dots drawn from circles, not taken from an icon set.
function DotsIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-2 w-2" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  )
}

// A tick drawn from two line segments, not taken from an icon set.
function CheckIcon(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-1.5 w-1.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5 L10 17.5 L19 7" />
    </svg>
  )
}

// The ⋯ menu on a manual game's card (docs/features/library-tools.md,
// "Editing"): its own button beside the card's play button, like the star.
// A menu button in the usual way: Enter, Space or ↓ opens it on the first
// item, ↑ on the last; arrows, Home and End move; Esc or Tab closes it, and
// Esc puts focus back on ⋯. The list is only in the page while open (Ctrl+F
// relies on that, see LibraryScreen). The cover choice is a radio group
// inside the menu (menuitemradio with aria-checked), so screen readers say
// which one is on.
function ManualGameMenu({
  gameTitle,
  coverSource,
  disabled,
  onSelect
}: ManualGameMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  // Which item gets focus when the menu opens.
  const [startAt, setStartAt] = useState<'first' | 'last'>('first')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const menuId = useId()

  const items = (): HTMLButtonElement[] =>
    // menuitem and menuitemradio.
    Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? [])

  useEffect(() => {
    if (!open) return
    const list = items()
    ;(startAt === 'first' ? list[0] : list[list.length - 1])?.focus()
    // A click anywhere else closes it, without moving focus.
    const handlePointer = (event: PointerEvent): void => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointer)
    return () => document.removeEventListener('pointerdown', handlePointer)
  }, [open, startAt])

  const openAt = (where: 'first' | 'last'): void => {
    setStartAt(where)
    setOpen(true)
  }

  const handleButtonKey = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      openAt('first')
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openAt('last')
    }
  }

  const handleMenuKey = (event: React.KeyboardEvent): void => {
    const list = items()
    const index = list.indexOf(document.activeElement as HTMLButtonElement)
    const move = (to: number): void => {
      event.preventDefault()
      list[(to + list.length) % list.length]?.focus()
    }
    switch (event.key) {
      case 'ArrowDown':
        return move(index + 1)
      case 'ArrowUp':
        return move(index - 1)
      case 'Home':
        return move(0)
      case 'End':
        return move(list.length - 1)
      case 'Escape':
        event.preventDefault()
        // Not also the drawer or the search box: this Esc was for the menu.
        event.stopPropagation()
        setOpen(false)
        buttonRef.current?.focus()
        return
      case 'Tab':
        setOpen(false)
        return
    }
  }

  // `checked` makes it one of the cover radio items; undefined, a plain item.
  const itemButton = (
    action: ManualMenuAction,
    label: string,
    checked?: boolean
  ): React.JSX.Element => (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      tabIndex={-1}
      aria-disabled={disabled}
      onClick={() => {
        if (disabled) return
        setOpen(false)
        onSelect(action, buttonRef.current)
      }}
      className={`flex w-full items-center gap-0.5 px-2 py-0.5 text-left text-sm focus-visible:bg-surface focus-visible:outline-none ${
        disabled
          ? 'cursor-default text-muted'
          : action === 'remove'
            ? 'text-danger hover:bg-surface'
            : 'hover:bg-surface'
      }`}
    >
      {checked === undefined ? null : checked ? (
        <CheckIcon />
      ) : (
        // Same width as the tick, so both labels line up.
        <span aria-hidden="true" className="w-1.5 shrink-0" />
      )}
      {label}
    </button>
  )

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openAt('first'))}
        onKeyDown={handleButtonKey}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`More for ${gameTitle}`}
        title="More"
        className={`absolute right-1 top-6 flex h-4 w-4 items-center justify-center rounded-full bg-background/80 text-muted transition-[transform,opacity] duration-150 hover:text-text focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent group-hover:-translate-y-1 peer-focus-visible:-translate-y-1 ${
          open
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 peer-focus-visible:opacity-100 [@media(hover:none)]:opacity-40'
        }`}
      >
        <DotsIcon />
      </button>
      {/* w-20 (160 px): never wider than the narrowest card, so it can't
          stick out past the first column's edge. */}
      {open && (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`More for ${gameTitle}`}
          onKeyDown={handleMenuKey}
          className="absolute right-0 top-11 z-10 flex w-20 flex-col rounded-control border border-border bg-surface-2 py-0.5 shadow-xl"
        >
          {EDIT_ITEMS.map((item) => (
            <li key={item.action} role="none">
              {itemButton(item.action, item.label)}
            </li>
          ))}
          <li role="separator" className="my-0.5 border-t border-border" />
          <li role="none">
            {/* Visible group name for sighted users; the group's aria-label
                says the same to screen readers, so this text is hidden. */}
            <span aria-hidden="true" className="block px-2 pt-0.5 text-xs text-muted">
              Cover
            </span>
            <ul role="group" aria-label="Cover">
              {COVER_ITEMS.map((item) => (
                <li key={item.action} role="none">
                  {itemButton(item.action, item.label, item.source === coverSource)}
                </li>
              ))}
            </ul>
          </li>
          <li role="separator" className="my-0.5 border-t border-border" />
          <li role="none">{itemButton('remove', 'Remove')}</li>
        </ul>
      )}
    </>
  )
}

export default ManualGameMenu
