'use client'

import { useId } from 'react'
import { clsx } from 'clsx'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  helperText?: string
  error?: string
}

export function Input({ label, helperText, error, className, id, ...props }: InputProps) {
  const generatedId = useId()
  const inputId = id || generatedId
  const helperId = helperText ? `${inputId}-help` : undefined
  const errorId = error ? `${inputId}-error` : undefined

  return (
    <div className="ui-input-wrap">
      {label && <label className="ui-label" htmlFor={inputId}>{label}</label>}
      <input
        id={inputId}
        className={clsx('ui-input', error && 'ui-input-error', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[helperId, errorId].filter(Boolean).join(' ') || undefined}
        {...props}
      />
      {helperText && <p id={helperId} className="ui-helper">{helperText}</p>}
      {error && <p id={errorId} className="ui-field-error" role="alert">{error}</p>}
    </div>
  )
}
