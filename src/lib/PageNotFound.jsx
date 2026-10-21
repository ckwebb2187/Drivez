import { Link } from 'react-router-dom';

export default function PageNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="text-6xl font-bold speed-font text-primary">404</div>
      <p className="text-sm text-muted-foreground mt-2">That page doesn't exist.</p>
      <Link to="/" className="mt-6 bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-bold">Go Home</Link>
    </div>
  );
}
