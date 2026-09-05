import type { ThemeChoice, ResolvedTheme } from '../hooks/useTheme'

const LABEL: Record<ThemeChoice, string> = {
  system: 'Match system',
  light: 'Light',
  dark: 'Dark',
}

/** One button that cycles the three states, saying which is active. */
export function ThemeToggle({
  choice,
  resolved,
  onCycle,
}: {
  choice: ThemeChoice
  resolved: ResolvedTheme
  onCycle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onCycle}
      title={`Theme: ${LABEL[choice]}. Click to change.`}
      aria-label={`Theme: ${LABEL[choice]}. Click to change.`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-primary-soft hover:text-primary-dark"
    >
      {choice === 'system' ? (
        // A monitor: following whatever the device says.
        <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-7v2h3v2H7v-2h3v-2H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 2v9h16V6H4Z" />
        </svg>
      ) : resolved === 'dark' ? (
        <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12.3 2a1 1 0 0 0-.9 1.5A7 7 0 0 1 4.5 13a1 1 0 0 0-1.2 1.4A9 9 0 1 0 12.3 2Z" />
        </svg>
      ) : (
        <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-14a1 1 0 0 1 1 1v1.5a1 1 0 0 1-2 0V4a1 1 0 0 1 1-1Zm0 15.5a1 1 0 0 1 1 1V21a1 1 0 0 1-2 0v-1.5a1 1 0 0 1 1-1ZM21 12a1 1 0 0 1-1 1h-1.5a1 1 0 0 1 0-2H20a1 1 0 0 1 1 1ZM5.5 12a1 1 0 0 1-1 1H3a1 1 0 0 1 0-2h1.5a1 1 0 0 1 1 1Zm12.7-6.2a1 1 0 0 1 0 1.4l-1 1a1 1 0 1 1-1.5-1.4l1-1a1 1 0 0 1 1.5 0ZM7.8 16.2a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.5-1.4l1-1a1 1 0 0 1 1.5 0Zm10.4 2.4a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 1.4-1.4l1 1a1 1 0 0 1 0 1.4ZM7.8 7.8a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 1.4-1.4l1 1a1 1 0 0 1 0 1.4Z" />
        </svg>
      )}
    </button>
  )
}
