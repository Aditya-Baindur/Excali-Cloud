"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import {
  ArrowRight,
  Brush,
  Cloud,
  Database,
  Layers,
  Lock,
  Sparkles,
  TimerReset
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

function Glow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute top-40 left-[10%] h-[380px] w-[380px] rounded-full bg-white/5 blur-3xl" />
      <div className="absolute top-56 right-[8%] h-[420px] w-[420px] rounded-full bg-white/5 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.10),transparent_55%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0)_0%,rgba(0,0,0,0.55)_55%,rgba(0,0,0,0.85)_100%)]" />
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:56px_56px]" />
    </div>
  )
}

function Feature({
  icon: Icon,
  title,
  desc
}: {
  icon: React.ElementType
  title: string
  desc: string
}) {
  return (
    <Card className="relative overflow-hidden rounded-3xl border-white/10 bg-white/[0.04] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-md">
      <div className="absolute inset-0 opacity-0 transition-opacity duration-300 hover:opacity-100">
        <div className="absolute -top-24 right-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
      </div>

      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-white">{title}</p>
          <p className="text-sm leading-relaxed text-white/70">{desc}</p>
        </div>
      </div>
    </Card>
  )
}

function ModeCard({
  title,
  badge,
  icon: Icon,
  bullets,
  ctaLabel,
  href,
  tone = "light"
}: {
  title: string
  badge: string
  icon: React.ElementType
  bullets: string[]
  ctaLabel: string
  href: string
  tone?: "light" | "dark"
}) {
  const isLight = tone === "light"

  return (
    <Card
      className={[
        "relative overflow-hidden rounded-3xl p-7 ring-1",
        isLight
          ? "border-white/10 bg-white/[0.05] ring-white/10"
          : "border-white/10 bg-white/[0.03] ring-white/10"
      ].join(" ")}
    >
      <div className="absolute inset-0">
        <div
          className={[
            "absolute -top-40 -right-24 h-[320px] w-[320px] rounded-full blur-3xl",
            isLight ? "bg-white/12" : "bg-white/8"
          ].join(" ")}
        />
      </div>

      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{title}</p>
              <p className="text-sm text-white/60">{badge}</p>
            </div>
          </div>

          <Badge className="rounded-full border-white/15 bg-white/10 text-white/90">
            {isLight ? "Fast" : "Stateful"}
          </Badge>
        </div>

        <ul className="mt-5 space-y-2 text-sm text-white/75">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6">
          <Button
            asChild
            className="h-11 w-full rounded-2xl bg-white text-black hover:bg-white/90"
          >
            <Link href={href} aria-label={ctaLabel}>
              {ctaLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>

          <p className="mt-3 text-xs text-white/55">
            {href === "/draw"
              ? "Temporary board deletes on refresh."
              : "Boards persist in Cloudflare R2 + D1."}
          </p>
        </div>
      </div>
    </Card>
  )
}

export default function Page() {
  const router = useRouter()
  const reduceMotion = useReducedMotion()

  const fadeUp = {
    initial: { opacity: 0, y: reduceMotion ? 0 : 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: "easeOut" as const }
  }

  return (
    <div className="relative min-h-screen bg-black text-white">
      <Glow />

      {/* Top bar */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <button
          onClick={() => router.push("/")}
          className="group inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/5"
          aria-label="Home"
        >
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
            <Layers className="h-4 w-4" />
          </span>
          <span className="tracking-tight">
            <span className="text-white">Blackbox</span>{" "}
            <span className="text-white/60">Boards</span>
          </span>
          <Badge className="ml-2 hidden rounded-full border-white/15 bg-white/10 text-white/80 sm:inline-flex">
            beta
          </Badge>
        </button>

        <nav className="hidden items-center gap-2 sm:flex">
          <Button asChild variant="ghost" className="rounded-2xl text-white/80 hover:bg-white/5">
            <Link href="#modes">Modes</Link>
          </Button>
          <Button asChild variant="ghost" className="rounded-2xl text-white/80 hover:bg-white/5">
            <Link href="#features">Features</Link>
          </Button>
          <Button
            asChild
            className="rounded-2xl bg-white text-black hover:bg-white/90"
          >
            <Link href="/dashboard">
              Open Dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </nav>

        <div className="flex items-center gap-2 sm:hidden">
          <Button
            asChild
            className="rounded-2xl bg-white text-black hover:bg-white/90"
          >
            <Link href="/dashboard">
              Start <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-16 pt-6 sm:pt-10">
        <motion.div {...fadeUp}>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            <Sparkles className="h-3.5 w-3.5" />
            Two modes: instant sketch or persistent workspace
          </div>

          <h1 className="mt-4 text-balance text-4xl font-extrabold tracking-tight sm:text-6xl">
            Draw instantly. Or build a{" "}
            <span className="relative">
              <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                persistent
              </span>
            </span>{" "}
            board universe.
          </h1>

          <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-white/70 sm:text-lg">
            Use <span className="text-white">/draw</span> for a one-time temporary
            board that disappears on refresh. Use{" "}
            <span className="text-white">/dashboard</span> for the stateful
            experience backed by Cloudflare <span className="text-white">R2</span>{" "}
            + <span className="text-white">D1</span>, where you can create a
            ridiculous number of boards.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              className="h-12 rounded-2xl bg-white text-black hover:bg-white/90"
            >
              <Link href="/dashboard">
                Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>

            <Button
              asChild
              variant="ghost"
              className="h-12 rounded-2xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              <Link href="/draw">
                Open Temp Board <Brush className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: TimerReset, label: "Instant /draw", sub: "No save, clears on refresh" },
              { icon: Database, label: "D1-backed", sub: "Board metadata persists" },
              { icon: Cloud, label: "R2 storage", sub: "Assets + snapshots" },
              { icon: Lock, label: "Stateful workspace", sub: "Make tons of boards" }
            ].map(({ icon: Icon, label, sub }) => (
              <Card
                key={label}
                className="rounded-3xl border-white/10 bg-white/[0.04] p-4 backdrop-blur-md"
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/60">{sub}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </motion.div>

        {/* Modes */}
        <section id="modes" className="mt-14">
          <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex items-end justify-between gap-6"
          >
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Pick your mode
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-white/65 sm:text-base">
                One click to sketch. One click to build a library of boards that
                sticks.
              </p>
            </div>
          </motion.div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ModeCard
              title="Temp board"
              badge="/draw — one-time session"
              icon={Brush}
              bullets={[
                "Perfect for quick ideas, scratch work, or sharing a link fast",
                "No account flow needed",
                "Deletes on refresh (no save)"
              ]}
              ctaLabel="Open /draw"
              href="/draw"
              tone="light"
            />

            <ModeCard
              title="Dashboard"
              badge="/dashboard — persistent workspace"
              icon={Layers}
              bullets={[
                "Boards persist in Cloudflare R2 + D1",
                "Create and manage a ton of boards",
                "Built for “I need this tomorrow too” projects"
              ]}
              ctaLabel="Open /dashboard"
              href="/dashboard"
              tone="dark"
            />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mt-14">
          <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Built for velocity
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-white/65 sm:text-base">
              Clean UI, fast entry points, and a clear split between disposable
              sketches and real work.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Feature
                icon={Sparkles}
                title="Gorgeous by default"
                desc="A dark, glassy aesthetic that makes your boards feel premium."
              />
              <Feature
                icon={TimerReset}
                title="Zero-commit mode"
                desc="Use /draw when you want a board that disappears when you’re done."
              />
              <Feature
                icon={Database}
                title="Stateful storage"
                desc="Use /dashboard when you want board lists + metadata that persist."
              />
              <Feature
                icon={Cloud}
                title="Cloudflare-native"
                desc="Designed around R2 for assets and D1 for structured board data."
              />
              <Feature
                icon={Lock}
                title="Future-ready"
                desc="Easy to layer auth, sharing, and permissions on top of the core split."
              />
              <Feature
                icon={ArrowRight}
                title="Two CTAs, no confusion"
                desc="Users immediately understand the difference between temp and saved."
              />
            </div>
          </motion.div>
        </section>

        {/* Bottom CTA */}
        <section className="mt-14">
          <Card className="relative overflow-hidden rounded-3xl border-white/10 bg-white/[0.04] p-7 backdrop-blur-md">
            <div className="absolute inset-0">
              <div className="absolute -bottom-24 left-1/2 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
            </div>

            <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
              <div>
                <p className="text-xl font-bold tracking-tight sm:text-2xl">
                  Start in seconds.
                </p>
                <p className="mt-1 text-sm text-white/65">
                  Sketch with /draw or build your full board library in /dashboard.
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button
                  asChild
                  className="h-12 rounded-2xl bg-white text-black hover:bg-white/90"
                >
                  <Link href="/dashboard">
                    Open Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="ghost"
                  className="h-12 rounded-2xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
                >
                  <Link href="/draw">
                    Temp Board <Brush className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        </section>

        {/* Footer */}
        <footer className="mt-14 pb-10 text-xs text-white/50">
          <div className="flex flex-col justify-between gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
            <p>© {new Date().getFullYear()} Blackbox Boards</p>
            <div className="flex items-center gap-4">
              <Link className="hover:text-white/80" href="#modes">
                Modes
              </Link>
              <Link className="hover:text-white/80" href="#features">
                Features
              </Link>
              <Link className="hover:text-white/80" href="/dashboard">
                Dashboard
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}