import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const navigate = useNavigate()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFile(file)
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setStatus('uploading')
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (response.ok) {
        setStatus('success')
        // Store the processed data ID and navigate to process page
        localStorage.setItem('attendance_data', JSON.stringify(data))
        navigate('/process')
      } else {
        setStatus('error')
        alert(data.detail || 'Upload failed')
      }
    } catch (err) {
      setStatus('error')
      alert('Upload failed')
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-6">Upload iVMS Attendance Export</h2>
      
      <div className="border rounded p-6 mb-8">
        <h3 className="text-lg font-medium mb-4">Supported Formats</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li>CSV files (.csv)</li>
          <li>Excel files (.xlsx, .xls)</li>
          <li>PDF files (.pdf)</li>
        </ul>
        <p className="text-sm text-gray-500 mt-2">
          Max file size: 50 MB
        </p>
      </div>

      {status === 'error' && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">
          <p>Error uploading file. Please try again.</p>
        </div>
      )}

      {status === 'success' && (
        <div className="mb-4 p-3 bg-green-100 text-green-800 rounded">
          <p>File uploaded successfully! Processing...</p>
        </div>
      )}

      <div>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,.pdf"
          onChange={handleChange}
          className="mt-4 block w-full text-sm text-gray-500 border border-gray-300 rounded-lg cursor-pointer py-2 px-3 mr-2 file:cursor-pointer file:select-none file:bg-gray-50 dark file:bg-gray-800 dark:text-gray-400"
        />
        <label htmlFor="file" className="mt-1 text-sm font-medium text-blue-600 hover:underline">
          Browse iVMS-4200 export file
        </label>
      </div>

      <button
        onClick={handleUpload}
        disabled={status !== 'idle' || !file}
        className="mt-6 w-full py-3 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'idle' ? 'Upload File' : status === 'uploading' ? 'Uploading...' : 'Uploaded!'}
      </button>
    </div>
  )
}