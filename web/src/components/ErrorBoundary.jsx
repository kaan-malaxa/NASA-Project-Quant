import { Component } from "react";

/**
 * Catches a crash in any screen and shows a friendly message with a link home, instead of a blank page.
 * `resetKey` (the route) clears the error when the visitor navigates elsewhere.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, key: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error, info) {
    console.error("Prometheus Torch screen error:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section role="alert" aria-labelledby="error-title" className="mx-auto max-w-xl space-y-3 px-4 py-10">
        <h1 id="error-title" className="text-2xl font-semibold">
          Something went wrong on this page
        </h1>
        <p>The rest of the site still works. Try again, or start from the beginning.</p>
        <p>
          {/* Plain link: works even if the router itself is what failed. */}
          <a href="#/" className="underline underline-offset-4">
            Go to the home page
          </a>
        </p>
        <details className="text-muted-foreground text-sm">
          <summary className="cursor-pointer">Technical detail</summary>
          <p className="mt-1 font-mono text-xs break-words">{String(this.state.error?.message || this.state.error)}</p>
        </details>
      </section>
    );
  }
}
