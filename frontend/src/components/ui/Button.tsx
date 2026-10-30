'use client'

import React, { ReactNode, cloneElement } from 'react'
import { clsx } from 'clsx'

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'outline'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  asChild?: boolean
  children: ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary: 'ui-button-primary',
  secondary: 'ui-button-secondary',
  success: 'ui-button-primary',
  danger: 'ui-button-danger',
  warning: 'ui-button-secondary',
  outline: 'ui-button-outline',
}
const sizeClasses: Record<Size, string> = { sm: 'ui-button-sm', md: '', lg: 'ui-button-lg' }

export function Button({ variant = 'primary', size = 'md', loading = false, disabled, children, className, asChild = false, ...props }: ButtonProps) {
  const buttonClasses = clsx('ui-button', variantClasses[variant], sizeClasses[size], className)
  const content = <>{loading && <span className="ui-spinner" aria-hidden="true" style={{ width: 14, height: 14, margin: 0, borderWidth: 2 }} />}{children}</>

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string; 'aria-disabled'?: boolean; tabIndex?: number }>
    return cloneElement(child, {
      className: clsx(child.props.className, buttonClasses),
      'aria-disabled': disabled || loading || undefined,
      tabIndex: disabled || loading ? -1 : child.props.tabIndex,
    })
  }

  return <button className={buttonClasses} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{content}</button>
}
