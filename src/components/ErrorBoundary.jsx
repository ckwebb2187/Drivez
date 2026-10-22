import { Component } from 'react';

// If a screen crashes, show a way back instead of a black screen.
// Changing `resetKey` (the current page) clears the error automatically.
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Screen crashed:', error, info?.componentStack); }
  componentDidUpdate(prev) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fixed inset-0 z-[3000] bg-background flex flex-col items-center justify-center p-8 text-center">
        <div className="text-4xl mb-3">🛠️</div>
        <h1 className="text-lg font-bold text-foreground">Something went wrong on this screen</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-5">Your drive and data are safe.</p>
        <button onClick={() => window.location.reload()} className="bg-primary text-primary-foreground rounded-xl px-6 py-3 font-bold text-sm">Reload</button>
        <button onClick={() => { this.setState({ error: null }); window.location.assign('/'); }} className="mt-2 text-sm text-muted-foreground py-2">Go to the map</button>
      </div>
    );
  }
}
