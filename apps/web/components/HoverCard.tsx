'use client'

import React from 'react'

export function HoverCard({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
    >
      {children}
    </div>
  )
}
