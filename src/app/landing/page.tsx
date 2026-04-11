'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { ChevronDown, Package, Truck, Warehouse, Home, CheckCircle2, Star, ArrowRight, Play } from 'lucide-react'

const HOW_IT_WORKS = [
  {
    step: 1,
    icon: '🏠',
    title: 'Pickup',
    desc: 'We come to you. Schedule a pickup and our team collects your packed totes right from your door.',
    color: 'bg-blue-50 border-brand-blue',
    iconBg: 'bg-brand-blue',
  },
  {
    step: 2,
    icon: '🚚',
    title: 'Transport',
    desc: 'Your totes are safely loaded and driven to our secure storage facility — no stops, no strangers.',
    color: 'bg-navy-50 border-brand-navy',
    iconBg: 'bg-brand-navy',
  },
  {
    step: 3,
    icon: '🏭',
    title: 'Store',
    desc: 'Totes are cataloged and stored in our clean, organized, protected warehouse. Track everything in the app.',
    color: 'bg-blue-50 border-brand-blue',
    iconBg: 'bg-brand-blue',
  },
  {
    step: 4,
    icon: '📬',
    title: 'Dropoff',
    desc: 'Need it back? Request a dropoff anytime and we\'ll deliver your totes straight to your door.',
    color: 'bg-navy-50 border-brand-navy',
    iconBg: 'bg-brand-navy',
  },
]

const BENEFITS = [
  {
    icon: <Package className="w-7 h-7 text-brand-blue" />,
    title: 'Know What You Have',
    desc: 'Every tote is cataloged with photos and item labels so you always know exactly what\'s stored.',
  },
  {
    icon: <Warehouse className="w-7 h-7 text-brand-blue" />,
    title: 'Secure Storage',
    desc: 'Your belongings are stored in a clean, monitored facility — not a damp garage or overpriced unit.',
  },
  {
    icon: <Truck className="w-7 h-7 text-brand-blue" />,
    title: 'On-Demand Delivery',
    desc: 'Request your totes back any time. We deliver to your door, no self-service required.',
  },
  {
    icon: <Home className="w-7 h-7 text-brand-blue" />,
    title: 'Reclaim Your Space',
    desc: 'Clear out the clutter without throwing anything away. Your home, your way.',
  },
  {
    icon: <CheckCircle2 className="w-7 h-7 text-brand-blue" />,
    title: 'No Long Contracts',
    desc: 'Pay month to month. Scale up or down as your needs change. Cancel anytime.',
  },
  {
    icon: <Star className="w-7 h-7 text-brand-blue" />,
    title: 'White-Glove Service',
    desc: 'From delivery to pickup to return — we handle the heavy lifting so you don\'t have to.',
  },
]

const FAQS = [
  {
    q: 'How big are the totes?',
    a: 'Our heavy-duty totes are 27 gallon capacity — large enough for bedding, clothing, books, seasonal decor, and more. Each tote holds approximately 50–60 lbs.',
  },
  {
    q: 'How does pricing work?',
    a: 'You pay a flat monthly rate per tote stored. Delivery and pickup fees apply per visit. No hidden fees, no long-term contracts.',
  },
  {
    q: 'How do I get my stuff back?',
    a: 'Open the app, go to My Items, select the totes you want returned, and pick a preferred delivery date. We\'ll confirm and deliver.',
  },
  {
    q: 'Is my stuff insured?',
    a: 'Yes — all stored items are covered under our storage insurance policy. Details are available in your account.',
  },
  {
    q: 'What can\'t I store?',
    a: 'We can\'t store hazardous materials, perishables, liquids, or anything illegal. Everything else is generally fine.',
  },
]

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── NAV ── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-5 h-20 flex items-center justify-between">
          <Image src="/logo.svg" alt="Tote Valet" width={180} height={68} priority />
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-semibold text-brand-navy hover:text-brand-blue transition-colors px-4 py-2">
              Log In
            </Link>
            <Link href="/register" className="bg-brand-navy text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-blue-900 active:scale-95 transition-all">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative pt-28 pb-20 px-5 overflow-hidden bg-gradient-to-br from-[#003087] via-[#00408C] to-[#00A0DF]">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-40 h-40 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-10 right-10 w-60 h-60 rounded-full bg-white blur-3xl" />
        </div>

        <div className="relative max-w-2xl mx-auto text-center">
          {/* Hero logo */}
          <div className="flex justify-center mb-6">
            <Image src="/logo.svg" alt="Tote Valet" width={280} height={106} className="drop-shadow-lg" priority />
          </div>

          <div className="inline-flex items-center gap-2 bg-white/15 text-white text-xs font-semibold px-4 py-2 rounded-full mb-6 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Now serving the Lehigh Valley
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight mb-5">
            Storage that comes<br />
            <span className="text-[#7DD3F8]">to you.</span>
          </h1>

          <p className="text-lg text-blue-100 mb-8 leading-relaxed max-w-lg mx-auto">
            We deliver totes, you fill them, we pick them up and store them safely.
            Get anything back with one tap — delivered to your door.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 bg-white text-brand-navy font-bold px-8 py-4 rounded-2xl hover:bg-blue-50 active:scale-95 transition-all text-base shadow-lg"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-white/15 text-white font-semibold px-8 py-4 rounded-2xl hover:bg-white/25 active:scale-95 transition-all text-base backdrop-blur-sm border border-white/20"
            >
              Log In
            </Link>
          </div>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-6 mt-10 text-blue-200 text-xs font-medium">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> No contract</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Insured storage</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> On-demand delivery</span>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-20 px-5 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-brand-blue font-bold text-sm uppercase tracking-widest mb-2">Simple Process</p>
            <h2 className="text-3xl sm:text-4xl font-black text-brand-navy">How Tote Valet Works</h2>
            <p className="text-gray-500 mt-3 max-w-lg mx-auto">Four easy steps between a cluttered home and clean, organized storage.</p>
          </div>

          {/* Flow diagram */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} className="flex items-center gap-3">
                <div className="flex flex-col items-center text-center w-36">
                  <div className={`w-16 h-16 rounded-2xl ${step.iconBg} flex items-center justify-center text-2xl mb-3 shadow-md`}>
                    {step.icon}
                  </div>
                  <p className="text-xs font-bold text-brand-navy uppercase tracking-wider">{step.title}</p>
                </div>
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden sm:block text-brand-blue">
                    <ArrowRight className="w-6 h-6" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Step detail cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-lg ${step.iconBg} flex items-center justify-center text-base`}>
                    {step.icon}
                  </div>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Step {step.step}</span>
                </div>
                <h3 className="font-bold text-brand-navy mb-1.5">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VIDEO PLACEHOLDER ── */}
      <section className="py-20 px-5 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-brand-blue font-bold text-sm uppercase tracking-widest mb-2">See It In Action</p>
          <h2 className="text-3xl font-black text-brand-navy mb-8">Watch how it works</h2>

          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-brand-navy to-brand-blue aspect-video flex items-center justify-center shadow-2xl group cursor-pointer">
            {/* Placeholder thumbnail overlay */}
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors" />
            <div className="relative z-10 flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur flex items-center justify-center border-2 border-white/40 group-hover:scale-110 transition-transform">
                <Play className="w-9 h-9 text-white fill-white ml-1" />
              </div>
              <p className="text-white font-semibold text-sm opacity-80">Coming Soon</p>
            </div>
            {/* Decorative tote icons in background */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none select-none">
              <span className="text-[200px]">📦</span>
            </div>
          </div>

          <p className="text-gray-400 text-sm mt-4">
            Video walkthrough coming soon. In the meantime,{' '}
            <Link href="/register" className="text-brand-blue font-semibold hover:underline">sign up free</Link>
            {' '}to explore the app.
          </p>
        </div>
      </section>

      {/* ── BENEFITS ── */}
      <section className="py-20 px-5 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-brand-blue font-bold text-sm uppercase tracking-widest mb-2">Why Choose Us</p>
            <h2 className="text-3xl sm:text-4xl font-black text-brand-navy">Storage, reimagined.</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {BENEFITS.map((b) => (
              <div key={b.title} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                  {b.icon}
                </div>
                <h3 className="font-bold text-brand-navy mb-2">{b.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING TEASER ── */}
      <section className="py-20 px-5 bg-brand-navy">
        <div className="max-w-xl mx-auto text-center">
          <p className="text-brand-blue font-bold text-sm uppercase tracking-widest mb-2">Simple Pricing</p>
          <h2 className="text-3xl font-black text-white mb-4">Pay per tote. No surprises.</h2>
          <p className="text-blue-200 mb-8 leading-relaxed">
            A flat monthly rate per tote stored. Delivery and pickup are billed per visit.
            No yearly commitments, no hidden fees.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-white text-brand-navy font-bold px-8 py-4 rounded-2xl hover:bg-blue-50 active:scale-95 transition-all shadow-lg"
          >
            View Pricing &amp; Sign Up
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 px-5 bg-white">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-brand-blue font-bold text-sm uppercase tracking-widest mb-2">FAQ</p>
            <h2 className="text-3xl font-black text-brand-navy">Common Questions</h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="border border-gray-200 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-brand-navy text-sm">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-20 px-5 bg-gradient-to-br from-[#003087] to-[#00A0DF]">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
            Ready to reclaim your space?
          </h2>
          <p className="text-blue-100 mb-8">
            Sign up in minutes. Your first tote delivery is just a tap away.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-white text-brand-navy font-bold px-10 py-4 rounded-2xl hover:bg-blue-50 active:scale-95 transition-all text-lg shadow-xl"
          >
            Get Started
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-brand-navy border-t border-white/10 px-5 py-10">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <Image src="/logo.svg" alt="Tote Valet" width={160} height={60} className="brightness-0 invert opacity-80" />
          <div className="flex gap-6 text-blue-300 text-sm">
            <Link href="/login" className="hover:text-white transition-colors">Log In</Link>
            <Link href="/register" className="hover:text-white transition-colors">Sign Up</Link>
            <a href="mailto:hello@totevalet.com" className="hover:text-white transition-colors">Contact</a>
          </div>
          <p className="text-blue-400 text-xs">© {new Date().getFullYear()} Tote Valet. All rights reserved.</p>
        </div>
      </footer>

    </div>
  )
}
