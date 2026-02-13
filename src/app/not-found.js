import Link from "next/link";

export default function NotFound() {
  return (
    <div className="error-page">
      <div className="error-container">
        {/* Decorative background orbs */}
        <div className="error-orb error-orb-1" />
        <div className="error-orb error-orb-2" />

        <div className="error-content">
          <span className="error-icon">🔍</span>
          <h1 className="error-code">404</h1>
          <h2 className="error-title">Page Not Found</h2>
          <p className="error-description">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <div className="error-actions">
            <Link href="/dashboard" className="error-button-primary">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
