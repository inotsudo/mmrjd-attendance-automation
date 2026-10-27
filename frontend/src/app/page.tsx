import type { ReactNode } from 'react'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100">
      <div className="max-w-3xl mx-auto p-4 py-12">
        <h1 className="text-3xl font-bold mb-6">MM&RJD Attendance Report</h1>
        <p className="text-gray-600 mb-8">Browser-based attendance reporting application</p>
        <div className="space-y-4">
          <a href="/upload" className="inline-block bg-blue-600 text-white font-medium px-6 py-3 rounded hover:bg-blue-700">
            Upload Attendance File
          </a>
          <a href="/rules" className="inline-block bg-green-600 text-white font-medium px-6 py-3 rounded hover:bg-green-700">
            Business Rules
          </a>
        </div>
      </div>
    </main>
  )
}