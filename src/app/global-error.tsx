'use client'

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: 'system-ui', padding: 24, textAlign: 'center' }}>
        <h1>Something went wrong</h1>
        <p>Nothing was changed.</p>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  )
}
