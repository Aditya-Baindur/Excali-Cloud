import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'

export default function SignInPage() {
  return (
    <div className="bg-terminal text-terminal-foreground relative flex h-dvh items-center justify-center overflow-hidden font-mono">
      {/* terminal grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
      </div>

      {/* auth container */}
      <div className="border-terminal-border bg-terminal-widget relative z-10 w-full max-w-md rounded-lg border p-6">
        {/* <div className="mb-6 text-center">
          <p className="text-terminal-muted">{"> Antares Terminal"}</p>
          <p className="mt-1 text-xs text-terminal-muted/80">
            Secure Market Intelligence Console
          </p>
        </div> */}

        <SignIn
          appearance={{
            elements: {
              /* ---------- TERMINAL SPACING PACK ---------- */

              /* Overall wrapper spacing */
              form: 'space-y-2',

              /* Every form field has even breathing room */
              formField: 'space-y-1',

              /* Input padding */
              formFieldInput:
                'w-[85%] mx-auto px-3 py-2 bg-transparent border border-terminal-border text-terminal-foreground placeholder:text-terminal-muted font-mono rounded-sm focus:ring-1 focus:ring-terminal-accent focus:border-terminal-accent',

              /* Label spacing */
              formFieldLabel: 'text-terminal-muted text-xs font-mono mb-1 pl-7',

              /* Section dividers */
              divider: 'my-4 flex justify-center',

              dividerLine: 'w-[60%] bg-terminal-border opacity-40',

              dividerText:
                'text-terminal-muted text-[10px] tracking-widest bg-terminal-widget px-2',

              /* Primary button padding */
              formButtonPrimary:
                'w-[85%] mx-auto py-2 font-mono bg-terminal-foreground text-terminal rounded-sm tracking-wide hover:opacity-90 transition',

              /* Social login buttons */
              socialButtons: 'space-y-2 ',
              socialButtonsBlockButton:
                'w-[85%] mx-auto py-2 px-3 border border-terminal-border text-terminal-foreground bg-transparent font-mono text-sm rounded-md flex items-center gap-2 hover:bg-terminal-header transition',

              socialButtonsProviderIcon: 'mx-1 opacity-100',

              // GitHub-only override
              socialButtonsProviderIcon__github: 'invert brightness-10',

              /* Remove weird spacing under Clerk */
              footer: 'hidden',
              footerAction: 'hidden',
              footerActionText: 'hidden',
              footerActionLink: 'hidden',
              footerPages: 'hidden',

              /* Container spacing (top-level card) */
              card: 'space-y-6 bg-transparent p-0 shadow-none border-0',
              header: 'space-y-1 mb-2',
              headerTitle: 'text-terminal-foreground font-mono text-xl',
              headerSubtitle: 'text-terminal-muted font-mono text-xs pt-2',
            },
          }}
        />

        <div className="flex justify-center">
          <Link
            href="/sign-up"
            className="text-terminal-muted border-terminal-border hover:text-terminal-foreground hover:border-terminal-accent mt-4 w-[85%] rounded-sm border py-2 pt-2 text-center font-mono text-xs tracking-widest transition"
          >
            CREATE ACCOUNT
          </Link>
        </div>
      </div>
    </div>
  )
}
