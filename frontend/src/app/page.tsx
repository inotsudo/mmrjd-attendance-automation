import './globals.css'

import type { ReactNode } from 'react'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="max-w-2xl mx-auto rounded-2xl bg-white p-8 shadow-2xl">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">MM&RJD Attendance Report</h1>
        <p className="text-gray-600 text-lg">Browser-based attendance reporting application</p>
        <div className="mt-8 space-y-4">
          <a
            href="/upload"
            className="w-full py-3 px-6 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Upload Attendance File
          </a>
          <a
            href="/rules"
            className="w-full py-3 px-6 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            Business Rules
          </a>
        </div>
      </div>
    </main>
  )
}