'use client'

import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

// "Couldn't load a panel" (mockup screen 1 § States): that panel alone says so with Try again; the rest of the
// workbench keeps working. Wraps each tab loaded with next/dynamic.

export class PanelError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="grid content-start gap-2.5">
        <p>We couldn’t load this. Nothing was changed.</p>
        <div><Button size="sm" variant="secondary" onClick={() => this.setState({ failed: false })}>Try again</Button></div>
      </div>
    )
  }
}
