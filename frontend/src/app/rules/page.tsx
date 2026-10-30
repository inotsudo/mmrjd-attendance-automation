'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { api, AttendanceRules } from '@/lib/api'
import Layout from '@/components/ui/Layout'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function RulesPage() {
  const [rules, setRules] = useState<AttendanceRules | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [policyNotes, setPolicyNotes] = useState<Record<string, string>>({})

  const loadRules = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await api.getRules()
      setRules(response.rules)
      setPolicyNotes(response.unresolved as Record<string, string>)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the configured rules.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadRules() }, [loadRules])

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = event.currentTarget
    setRules((current) => current ? { ...current, [name]: type === 'checkbox' ? checked : value } : current)
    setMessage(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!rules) return
    setUpdating(true)
    setMessage(null)
    try {
      const response = await api.updateRules(rules)
      setRules(response.rules)
      setMessage({ text: 'Effective rules saved. Previously processed results must be reprocessed before export.', type: 'success' })
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'The rules could not be saved.', type: 'error' })
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Layout title="Business rules" subtitle="Review and update the thresholds used when processing attendance records.">
      {loading ? <div className="ui-empty"><div className="ui-spinner"/><p>Loading configured rules…</p></div>
        : loadError || !rules ? <div className="page-stack"><div className="ui-alert ui-alert-error" role="alert">Configured rules could not be loaded: {loadError || 'No rule values were returned.'}</div><Button variant="outline" onClick={() => void loadRules()}>Retry</Button></div>
          : <div className="page-stack">
            {message && <div className={`ui-alert ${message.type === 'success' ? 'ui-alert-success' : 'ui-alert-error'}`} role={message.type === 'success' ? 'status' : 'alert'}>{message.text}</div>}
            <Card title="Effective attendance rules" subtitle="Only the settings below currently affect processing. A rules version is attached to each processed job.">
              <form onSubmit={handleSubmit} className="page-stack">
                <div className="rules-grid">
                  <fieldset className="rules-group">
                    <legend>Arrival policy</legend>
                    <p className="rules-group-description">Normal start and very-late threshold are applied. Late minutes currently count from normal start.</p>
                    <div className="rules-fields">
                      <Input type="time" label="Normal start time" name="normal_start_time" value={rules.normal_start_time} onChange={handleChange} required helperText="Expected start time for a regular work day."/>
                      <Input type="time" label="Very late arrival threshold" name="very_late_arrival_threshold" value={rules.very_late_arrival_threshold} onChange={handleChange} required helperText="Arrivals at or after this time are marked very late."/>
                    </div>
                  </fieldset>
                  <fieldset className="rules-group">
                    <legend>Workday and overtime</legend>
                    <p className="rules-group-description">Overtime after the weekday cutoff is calculated for complete attendance days.</p>
                    <div className="rules-fields">
                      <Input type="time" label="Overtime threshold" name="overtime_threshold" value={rules.overtime_threshold} onChange={handleChange} required helperText="Events at or after this time count toward overtime."/>
                    </div>
                  </fieldset>
                </div>
                <div className="ui-alert ui-alert-info"><strong>Policy decisions pending</strong><ul>{Object.entries(policyNotes).map(([key, note]) => <li key={key}>{note}</li>)}</ul></div>
                <div className="page-toolbar" style={{ justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid var(--line)' }}>
                  <Button type="submit" loading={updating} disabled={updating}>{updating ? 'Saving rules…' : 'Save rules'}</Button>
                </div>
              </form>
            </Card>
          </div>}
    </Layout>
  )
}
