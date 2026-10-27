'use client'

import { useState } from 'react'

export default function RulesPage() {
  const [rules, setRules] = useState({
    normal_start_time: '08:00',
    late_arrival_threshold: '08:30',
    very_late_arrival_threshold: '09:30',
    overtime_threshold: '19:30',
    default_work_end_time: '17:00',
    weekend_overtime_evaluated_separately: true,
  })
  const [updating, setUpdating] = useState(false)

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
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Late Arrival Threshold</label>
          <input
            type="time"
            name="late_arrival_threshold"
            value={rules.late_arrival_threshold}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Very Late Arrival Threshold</label>
          <input
            type="time"
            name="very_late_arrival_threshold"
            value={rules.very_late_arrival_threshold}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Overtime Threshold</label>
          <input
            type="time"
            name="overtime_threshold"
            value={rules.overtime_threshold}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Default Work End Time</label>
          <input
            type="time"
            name="default_work_end_time"
            value={rules.default_work_end_time}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            <input
              type="checkbox"
              name="weekend_overtime_evaluated_separately"
              checked={rules.weekend_overtime_evaluated_separately}
            />
            Weekend overtime evaluated separately
          </label>
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-green-600 text-white font-medium rounded hover:bg-green-700"
        >
          Save Rules
        </button>
      </form>
    </div>
  )
}
