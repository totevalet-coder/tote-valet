'use client'

import { useState } from 'react'
import { ChevronDown, Phone, Mail, MessageCircle } from 'lucide-react'

const FAQS = [
  {
    q: 'How do I request my items back?',
    a: 'Tap "My Items / Request Return" on your dashboard. Select the tote you want returned and confirm the request. We\'ll schedule delivery on our next available route in your area.',
  },
  {
    q: 'When will my tote be picked up or delivered?',
    a: 'We run routes Monday through Saturday. After you submit a request, your stop is added to the next scheduled route. You\'ll receive a notification when your driver is on the way.',
  },
  {
    q: 'How do I add items to my tote before drop-off?',
    a: 'Tap "+ Add Items to Tote" from the dashboard. You can take a photo, scan a barcode, or type items manually. Items are saved to your tote record.',
  },
  {
    q: 'What does the seal number mean?',
    a: 'Each tote is sealed with a tamper-evident sticker before storage. The seal number is recorded so we can verify the tote hasn\'t been opened. Your driver will check this on delivery.',
  },
  {
    q: 'How is my monthly bill calculated?',
    a: 'You\'re billed a flat rate per tote stored in our warehouse each month. Empty totes at your home may incur a small weekly fee. Check the Billing section for your current charges.',
  },
  {
    q: 'What happens if a tote is damaged or lost?',
    a: 'Contact us immediately. Damaged totes are documented with photos during every pickup and delivery. Lost totes are investigated and a replacement fee may apply.',
  },
  {
    q: 'Can I add or remove totes from my plan?',
    a: 'Yes. Contact us to adjust your tote count. Additional totes can be delivered on your next scheduled route.',
  },
  {
    q: 'How do I update my payment method?',
    a: 'Go to Billing & Invoice from the menu. Tap "Update Card" to add a new payment method. Your previous card will be removed after the new one is verified.',
  },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-semibold text-brand-navy text-sm pr-4">{q}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-4">
          <p className="text-sm text-gray-600 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  )
}

export default function HelpPage() {
  return (
    <div className="px-5 pt-6 pb-6 space-y-6">
      <h1 className="font-black text-2xl text-brand-navy">Help & Support</h1>

      {/* Contact cards */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Phone,         label: 'Call Us',   sub: '(610) 555-0100', color: 'bg-green-50 text-green-700' },
          { icon: Mail,          label: 'Email',     sub: 'hello@totevalet.com', color: 'bg-blue-50 text-brand-blue' },
          { icon: MessageCircle, label: 'Text Us',   sub: 'SMS Support', color: 'bg-purple-50 text-purple-700' },
        ].map(({ icon: Icon, label, sub, color }) => (
          <div key={label} className={`${color} rounded-2xl p-3 text-center`}>
            <Icon className="w-5 h-5 mx-auto mb-1.5" />
            <p className="text-xs font-bold">{label}</p>
            <p className="text-[10px] opacity-70 mt-0.5 break-words">{sub}</p>
          </div>
        ))}
      </div>

      {/* Hours */}
      <div className="card">
        <p className="font-bold text-brand-navy text-sm mb-3">Support Hours</p>
        <div className="space-y-2 text-sm">
          {[
            { day: 'Monday – Friday', hours: '8:00 AM – 6:00 PM' },
            { day: 'Saturday',        hours: '9:00 AM – 2:00 PM' },
            { day: 'Sunday',          hours: 'Closed' },
          ].map(({ day, hours }) => (
            <div key={day} className="flex justify-between">
              <span className="text-gray-500">{day}</span>
              <span className="font-semibold text-brand-navy">{hours}</span>
            </div>
          ))}
        </div>
      </div>

      {/* FAQs */}
      <div>
        <p className="font-bold text-brand-navy text-sm mb-3">Frequently Asked Questions</p>
        <div className="space-y-2">
          {FAQS.map(({ q, a }) => <FAQItem key={q} q={q} a={a} />)}
        </div>
      </div>

      {/* Station address */}
      <div className="bg-brand-navy/5 border border-brand-navy/10 rounded-2xl px-5 py-4 text-center space-y-1">
        <p className="text-xs font-bold text-brand-navy">Our Facility</p>
        <p className="text-sm text-gray-600">6582 Gun Club Rd</p>
        <p className="text-sm text-gray-600">Coopersburg, PA 18036</p>
      </div>
    </div>
  )
}
