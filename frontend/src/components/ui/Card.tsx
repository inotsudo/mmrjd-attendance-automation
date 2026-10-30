import { ReactNode } from 'react'

interface CardProps {
  children?: ReactNode
  title?: string
  subtitle?: string
  className?: string
  headerAction?: ReactNode
  id?: string
}

export function Card({ children, title, subtitle, className = '', headerAction, id }: CardProps) {
  return (
    <section id={id} className={`ui-card ${className}`}>
      {(title || subtitle || headerAction) && (
        <header className="ui-card-header">
          <div className="ui-card-heading">
            {title && <h2 className="ui-card-title">{title}</h2>}
            {subtitle && <p className="ui-card-subtitle">{subtitle}</p>}
          </div>
          {headerAction && <div className="ui-card-action">{headerAction}</div>}
        </header>
      )}
      {children !== undefined && <div className="ui-card-body">{children}</div>}
    </section>
  )
}
