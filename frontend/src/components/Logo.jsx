export default function Logo({ size = 36, className = '' }) {
  return (
    <img
      src="/logo.png"
      alt="The Souled Store"
      width={size}
      height={size}
      className={`rounded-lg flex-shrink-0 ${className}`}
    />
  );
}
