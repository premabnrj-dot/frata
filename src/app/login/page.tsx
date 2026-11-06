import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-md border border-border bg-card p-6">
        <div>
          <p className="text-sm font-semibold text-brand">Frata</p>
          <h1 className="mt-1 text-xl font-semibold">Sign in to your store</h1>
        </div>
        <LoginForm />
      </div>
    </main>
  )
}
