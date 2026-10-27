import { useState, useEffect } from 'react'

export default function RulesPage() {
  const [rules, setRules] = useState<any>({
    normal_start_time: '08:00',
    late_arrival_threshold: '08:30',
    very_late_arrival_threshold: '09:30',
    overtime_threshold: '19:30',
    default_work_end_time: '17:00',
    weekend_overtime_evaluated_separately: true,
  })
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    fetch('/api/rules')
      .then((res) => res.json())
      .then((data) => setRules(data.rules))
      .catch(() => console.error('Failed to fetch rules'))
  }, [])

  const handleUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.name
    let value = e.target.value
    if (name === 'weekend_overtime_evaluated_separately') {
      value = e.target.checked
    }
    setRules((prev) => ({ ...prev, [name]: value }))
  }

  const saveRules = async () => {
    setUpdating(true)
    try {
      await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules),
      })
      alert('Rules updated successfully!')
    } catch (err) {
      alert('Failed to update rules')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-6">Business Rules Configuration</h2>

      <form className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Normal Start Time</label>
          <input
            type="time"
            name="normal_start_time"
            value={rules.normal_start_time}
            onChange={handleUpdate}
            className="w-full border border-gray-300 rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Late Arrival Threshold</label>
          <input
            type="time"
            name="late_arrival_threshold"
            value={rules.late_arrival_threshold}
            onChange={handleUpdate}
            className="w-full border border-gray-300 rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Very Late Arrival Threshold</label>
          <input
            type="time"
            name="very_late_arrival_threshold"
            value={rules.very_late_arrival_threshold}
            onChange={handleUpdate}
            className="w-full border border-gray-300 rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Overtime Threshold</label>
          <input
            type="time"
            name="overtime_threshold"
            value={rules.overtime_threshold}
            onChange={handleUpdate}
            className="w-full border border-gray-300 rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Default Work End Time</label>
          <input
            type="time"
            name="default_work_end_time"
            value={rules.default_work_end_time}
            onChange={handleUpdate}
            className="w-full border border-gray-300 rounded-lg p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            <input
              type="checkbox"
              name="weekend_overtime_evaluated_separately"
              checked={rules.weekend_overtime_evaluated_separately}
              onChange={handleUpdate}
              className="rounded border-gray-300 w-4 h-4 focus:ring-blue-500"
            />
            Weekend overtime evaluated separately
          </label>
        </div>

        <button
          type="submit"
          onClick={saveRules}
          disabled=updating
          className="w-full py-3 bg-green-600 text-white font-medium rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {updating ? 'Saving...' : 'Save Rules'}
        </button>
      </form>
    </div>
  )
}