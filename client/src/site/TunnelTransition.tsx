/** A short pass through a dark tunnel between the station and the ride. */
export function TunnelTransition({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="tunnel" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} className="tunnel-light" style={{ animationDelay: `${i * 140}ms` }} />
      ))}
    </div>
  );
}
