import { APP_NAME } from '@shared/app-info'

function App(): React.JSX.Element {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <h1 className="text-3xl font-semibold">{APP_NAME}</h1>
      <p className="text-muted">Your library will live here.</p>
      <span className="mt-2 rounded-control bg-accent px-2 py-1 text-sm font-medium transition-colors hover:bg-accent-hover">
        Tokens loaded
      </span>
    </main>
  )
}

export default App
