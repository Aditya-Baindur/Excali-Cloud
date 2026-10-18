import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'

export default function SignInPage() {
  return (
    <main className="dark flex min-h-dvh items-center justify-center bg-neutral-950 px-6 py-12 text-white">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 inline-block text-sm text-neutral-400 hover:text-white"
        >
          Back
        </Link>
        <SignIn
          appearance={{
            variables: {
              colorBackground: '#0a0a0a',
              colorText: '#ffffff',
              colorTextSecondary: '#a3a3a3',
              colorInputBackground: '#171717',
              colorInputText: '#ffffff',
              colorPrimary: '#7c3aed',
              colorNeutral: '#ffffff',
            },
            elements: {
              rootBox: 'w-full',
              cardBox: 'w-full shadow-none',
              card: 'gap-6 border border-white/10 bg-neutral-950 shadow-none',
              headerTitle: 'text-white',
              headerSubtitle: 'text-neutral-400',
              formFieldLabel: 'text-neutral-300',
              formFieldInput: 'border-white/15 bg-neutral-900 text-white',
              socialButtonsBlockButton:
                'border-white/15 bg-neutral-900 text-white hover:bg-white/10',
              dividerLine: 'bg-white/10',
              dividerText: 'text-neutral-500',
              footer: 'hidden',
              footerAction: 'hidden',
              footerActionText: 'hidden',
              footerActionLink: 'hidden',
              footerPages: 'hidden',
            },
          }}
        />
      </div>
    </main>
  )
}
