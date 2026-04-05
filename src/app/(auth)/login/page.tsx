// Section 5.1 — Login screen (scaffold — full build in next section)
export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-navy p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-brand-navy rounded-2xl mx-auto mb-3 flex items-center justify-center">
            <span className="text-white text-2xl font-black">TV</span>
          </div>
          <h1 className="text-2xl font-black text-brand-navy">Tote Valet</h1>
          <p className="text-sm text-gray-500 mt-1">We Pick Up, Transport, Store and Deliver.</p>
        </div>
        <p className="text-gray-400 text-sm">Login coming in Section 5 build...</p>
      </div>
    </div>
  )
}
