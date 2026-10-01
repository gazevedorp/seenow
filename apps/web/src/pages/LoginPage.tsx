import { useState, type FormEvent } from "react"
import { Navigate } from "react-router-dom"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { auth, useSession } from "@/lib/auth"
import { supabaseConfig } from "@/lib/supabase"
import { useTitle } from "@/lib/use-title"

export function LoginPage() {
  const session = useSession()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  useTitle("Entrar")

  if (session) return <Navigate to="/" replace />

  function submit(event: FormEvent) {
    event.preventDefault()
    const problem = auth.enterWithPassword(email, password)
    if (problem === "email") setError("Informe um e-mail válido.")
    else if (problem === "password") setError("A senha local precisa ter pelo menos 4 caracteres.")
    else setError(null)
  }

  const supabase = supabaseConfig()

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden bg-pine text-foam lg:flex">
        <div className="m-auto max-w-xl px-12 py-16">
          <p className="text-xs tracking-[0.22em] uppercase">Seenow</p>
          <h1 className="mt-4 font-display text-6xl leading-[0.95] text-balance">
            O piso e a parede, no ambiente real.
          </h1>
          <p className="mt-5 max-w-md text-base text-foam/80">
            A loja mostra o produto do catálogo na foto do cliente, com máscara conferida e comparação antes e depois.
          </p>
          <div className="mt-10 grid max-w-md grid-cols-2 overflow-hidden rounded-2xl ring-1 ring-white/15">
            <div>
              <div className="h-28 bg-[#e6dfd4]" />
              <div className="h-20 bg-[#cbb89a]" />
              <p className="px-3 py-2 text-xs tracking-wide text-foam/70 uppercase">Antes</p>
            </div>
            <div>
              <div className="h-28 bg-[#e6dfd4]" />
              <div className="h-20 bg-[#8d5a3c]" />
              <p className="px-3 py-2 text-xs tracking-wide text-foam/70 uppercase">Depois</p>
            </div>
          </div>
        </div>
      </section>
      <section className="relative flex items-center bg-background px-5 py-12">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-md">
          <p className="font-display text-3xl lg:hidden">SEENOW</p>
          <h2 className="mt-2 font-display text-4xl tracking-tight">Entrar no estúdio</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Use a demonstração para validar o fluxo neste navegador. Nenhuma chave de API é necessária.
          </p>
          <Button type="button" className="mt-6 h-11 w-full" onClick={() => auth.enterDemo()}>
            Entrar na demonstração
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Entra como Ana Duarte, na Loja demonstração. Os projetos ficam só neste navegador.
          </p>
          <div className="my-6 flex items-center gap-3 text-xs tracking-[0.16em] text-muted-foreground uppercase">
            <span className="h-px flex-1 bg-border" />
            ou e-mail local
            <span className="h-px flex-1 bg-border" />
          </div>
          <form className="grid gap-3" onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                className="h-10"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@loja.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                className="h-10"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="qualquer senha com 4+ caracteres"
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" variant="outline" className="h-10">
              Entrar
            </Button>
          </form>
          <p className="mt-6 text-xs text-muted-foreground">
            {supabase.configured
              ? "Supabase foi detectado nas variáveis de ambiente. A autenticação real entra na fase 2; esta sessão continua local."
              : "Sem Supabase configurado, qualquer e-mail válido entra no modo local. A senha não sai deste navegador."}
          </p>
        </div>
      </section>
    </div>
  )
}
